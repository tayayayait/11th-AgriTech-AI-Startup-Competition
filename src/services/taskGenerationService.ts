import {
  buildTaskCardDrafts,
  type BuildTaskCardDraftsInput,
} from "@/domain/tasks/taskCardEngine";
import type { TaskCard } from "@/domain/tasks/types";
import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import {
  getNpmsPestCandidates,
  getNpmsPestDetail,
  getSummarizedPestDetail,
} from "@/services/npmsPestService";
import { toTaskCard } from "@/services/taskService";
import {
  applyTaskCardRefinements,
  extractChecksFromDetailText,
  refineTaskCardsWithGemini,
} from "@/services/geminiTaskCardService";

export interface GenerateTaskCardsForFieldInput extends BuildTaskCardDraftsInput {
  fieldId: string;
  today?: Date;
}

const toDueAt = (today: Date, dueInDays: number): string => {
  const dueAt = new Date(today);
  dueAt.setDate(dueAt.getDate() + dueInDays);
  return dueAt.toISOString();
};

const toDateKey = (isoString: string | null): string => {
  if (!isoString) return "";
  const timestamp = Date.parse(isoString);
  if (!Number.isFinite(timestamp)) return isoString;
  return new Date(timestamp).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
};

const GENERATED_TITLE_PREFIXES = ["농작업일정 확인:", "농작업일정 실행:", "주간농사정보 확인:", "주간농사정보 실행:", "주간농사정보 기반 작업 실행"];

const deletePendingGeneratedTasks = async (fieldId: string, titles: string[]): Promise<void> => {
  if (titles.length > 0) {
    const { error: deleteError } = await supabase
      .from("task_cards")
      .delete()
      .eq("field_id", fieldId)
      .in("title", titles)
      .eq("status", "pending");

    if (deleteError) throw deleteError;
  }

  for (const prefix of GENERATED_TITLE_PREFIXES) {
    const { error } = await supabase
      .from("task_cards")
      .delete()
      .eq("field_id", fieldId)
      .ilike("title", `${prefix}%`)
      .eq("status", "pending");

    if (error) throw error;
  }
};

export const generateAndSaveTaskCardsForField = async (
  input: GenerateTaskCardsForFieldInput,
): Promise<TaskCard[]> => {
  const today = input.today ?? new Date();

  const pestRisks = [...input.pestRisks];
  if (pestRisks.length > 0) {
    const topRisk = [...pestRisks].sort((a, b) => b.score - a.score)[0];
    try {
      const candidates = await getNpmsPestCandidates(input.cropName, 10);
      const match = candidates.find((c) => c.name === topRisk.candidateName);
      if (match && match.detailServiceCode && match.detailKey) {
        const detail = await getNpmsPestDetail({
          kind: match.kind,
          name: match.name,
          detailServiceCode: match.detailServiceCode,
          detailKey: match.detailKey,
        });
        const summary = getSummarizedPestDetail(detail);
        if (summary) {
          topRisk.ncpmsDetail = summary;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  const drafts = buildTaskCardDrafts({ ...input, pestRisks, today });

  for (const draft of drafts) {
    if (draft.detailText) {
      const operationName = draft.title.replace("농작업일정 실행: ", "").replace("농작업일정 확인: ", "");
      try {
        const extractedChecks = await extractChecksFromDetailText({
          cropName: input.cropName,
          operationName,
          detailText: draft.detailText,
        });
        if (extractedChecks.length > 0) {
          draft.checks = extractedChecks.map((label) => ({ label, done: false }));
        }
      } catch (e) {
        // ignore
      }
    }
  }

  let refinedDrafts = drafts;
  if (drafts.length > 0) {
    try {
      const refinements = await refineTaskCardsWithGemini({
        cropName: input.cropName,
        todayIso: today.toISOString(),
        drafts,
      });
      refinedDrafts = applyTaskCardRefinements(drafts, refinements);
    } catch {
      // Deterministic candidates remain the safe fallback when Gemini is unavailable.
    }
  }

  const titles = refinedDrafts.map((draft) => draft.title);
  await deletePendingGeneratedTasks(input.fieldId, titles);

  if (refinedDrafts.length === 0) return [];

  const draftsWithDueAt = refinedDrafts.map((draft) => ({
    draft,
    dueAt: toDueAt(today, draft.dueInDays),
  }));

  const { data: completedRows, error: completedError } = await supabase
    .from("task_cards")
    .select("title,due_at")
    .eq("field_id", input.fieldId)
    .in("title", titles)
    .eq("status", "done");

  if (completedError) throw completedError;

  const completedKeys = new Set(
    (completedRows ?? []).map((row) => `${row.title}:${toDateKey(row.due_at)}`),
  );
  const insertableDrafts = draftsWithDueAt.filter(
    ({ draft, dueAt }) => !completedKeys.has(`${draft.title}:${toDateKey(dueAt)}`),
  );

  if (insertableDrafts.length === 0) return [];

  const payload: TablesInsert<"task_cards">[] = insertableDrafts.map(({ draft, dueAt }) => ({
    field_id: input.fieldId,
    priority: draft.priority,
    title: draft.title,
    reason: draft.reason,
    duration_min: draft.durationMin,
    due_at: dueAt,
    checks: draft.checks as unknown as Json,
    sources: draft.sources as unknown as Json,
    status: "pending",
  }));

  const { data, error: insertError } = await supabase
    .from("task_cards")
    .insert(payload)
    .select("*")
    .order("priority");

  if (insertError) throw insertError;
  return (data ?? []).map(toTaskCard);
};
