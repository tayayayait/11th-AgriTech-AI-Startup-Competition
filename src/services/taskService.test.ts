import { describe, expect, it } from "vitest";
import { toTaskCard } from "@/services/taskService";
import type { Tables } from "@/integrations/supabase/types";

describe("toTaskCard", () => {
  it("normalizes HTML fragments from persisted generated task text", () => {
    const row: Tables<"task_cards"> = {
      id: "task-1",
      field_id: "field-1",
      priority: 3,
      title: "농작업일정 실행: 세포분열기<br/>(과실비대1기)",
      reason: "복숭아&nbsp;농작업일정 기준",
      duration_min: 20,
      due_at: null,
      checks: [{ label: "세포분열기&lt;br/&gt;(과실비대1기) 적용 여부 확인", done: false }],
      sources: [{ name: "농사로 농작업일정 시기: 세포분열기<br/>(과실비대1기)" }],
      status: "pending",
      completed_at: null,
      created_at: "2026-05-11T00:00:00.000Z",
    };

    expect(toTaskCard(row)).toMatchObject({
      title: "농작업일정 실행: 세포분열기 (과실비대1기)",
      reason: "복숭아 농작업일정 기준",
      checks: [{ label: "세포분열기 (과실비대1기) 적용 여부 확인", done: false }],
      sources: [{ name: "농사로 농작업일정 시기: 세포분열기 (과실비대1기)" }],
    });
  });
});
