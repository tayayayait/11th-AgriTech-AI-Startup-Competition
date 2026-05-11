import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { TimelineItemInsert } from "@/domain/timeline/timelineItems";

export type TimelineItemRow = Tables<"timeline_items">;

export async function createTimelineItem(item: TimelineItemInsert): Promise<void> {
  const { error } = await supabase.from("timeline_items").insert(item);
  if (error) throw error;
}

export async function tryCreateTimelineItem(item: TimelineItemInsert): Promise<void> {
  try {
    await createTimelineItem(item);
  } catch {
    // Timeline is audit/supporting data. Primary field workflows must not be blocked by a transient timeline insert failure.
  }
}

export async function getTimelineItemsByField(fieldId: string, limit = 30): Promise<TimelineItemRow[]> {
  const { data, error } = await supabase
    .from("timeline_items")
    .select("*")
    .eq("field_id", fieldId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}
