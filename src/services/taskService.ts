import type { TaskCard, TaskCheck, TaskSource, TaskStatus } from "@/domain/tasks/types";
import { normalizeHtmlSingleLineText } from "@/domain/text/html";
import { buildTaskDoneTimelineItem } from "@/domain/timeline/timelineItems";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { tryCreateTimelineItem } from "@/services/timelineService";

type TaskCardRow = Tables<"task_cards">;

const KNOWN_TASK_STATUS = new Set<TaskStatus>([
  "pending",
  "in_progress",
  "done",
  "deferred",
  "cancelled",
]);

function toTaskStatus(status: string): TaskStatus {
  return KNOWN_TASK_STATUS.has(status as TaskStatus) ? (status as TaskStatus) : "pending";
}

function toTaskChecks(value: Json): TaskCheck[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = typeof item.label === "string" ? normalizeHtmlSingleLineText(item.label) ?? "" : "";
      const done = Boolean(item.done);
      if (!label) return null;
      return { label, done };
    })
    .filter((item): item is TaskCheck => item !== null);
}

function toTaskSources(value: Json): TaskSource[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = typeof item.name === "string" ? normalizeHtmlSingleLineText(item.name) ?? "" : "";
      if (!name) return null;
      const collectedAt = typeof item.collectedAt === "string" ? item.collectedAt : undefined;
      const url = typeof item.url === "string" ? item.url : undefined;
      return { name, collectedAt, url };
    })
    .filter((item): item is TaskSource => item !== null);
}

export function toTaskCard(row: TaskCardRow): TaskCard {
  return {
    id: row.id,
    field_id: row.field_id,
    priority: row.priority,
    title: normalizeHtmlSingleLineText(row.title) ?? row.title,
    reason: normalizeHtmlSingleLineText(row.reason) ?? row.reason,
    duration_min: row.duration_min,
    due_at: row.due_at,
    checks: toTaskChecks(row.checks),
    sources: toTaskSources(row.sources),
    status: toTaskStatus(row.status),
    completed_at: row.completed_at,
  };
}

export async function getTaskCards(): Promise<TaskCard[]> {
  const { data, error } = await supabase.from("task_cards").select("*").order("priority");
  if (error) throw error;
  return (data ?? []).map(toTaskCard);
}

export async function getPendingTaskCardsByField(fieldId: string): Promise<TaskCard[]> {
  const { data, error } = await supabase
    .from("task_cards")
    .select("*")
    .eq("field_id", fieldId)
    .eq("status", "pending")
    .order("priority");

  if (error) throw error;
  return (data ?? []).map(toTaskCard);
}

export async function getTaskCardsByField(fieldId: string): Promise<TaskCard[]> {
  const { data, error } = await supabase
    .from("task_cards")
    .select("*")
    .eq("field_id", fieldId)
    .order("priority");

  if (error) throw error;
  return (data ?? []).map(toTaskCard);
}

export async function updateTaskChecks(taskId: string, checks: TaskCheck[]): Promise<void> {
  const { error } = await supabase
    .from("task_cards")
    .update({ checks: checks as unknown as Json })
    .eq("id", taskId);
  if (error) throw error;
}

export async function markTaskDone(taskId: string, checks?: TaskCheck[]): Promise<void> {
  const completedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("task_cards")
    .update({
      status: "done",
      completed_at: completedAt,
      ...(checks ? { checks: checks as unknown as Json } : {}),
    })
    .eq("id", taskId)
    .select("id,field_id,title,completed_at")
    .single();
  if (error) throw error;

  if (data.field_id) {
    await tryCreateTimelineItem(buildTaskDoneTimelineItem({
      fieldId: data.field_id,
      taskId: data.id,
      title: data.title,
      completedAt: data.completed_at ?? completedAt,
    }));
  }
}

export async function reopenTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from("task_cards")
    .update({ status: "pending", completed_at: null })
    .eq("id", taskId);
  if (error) throw error;
}
