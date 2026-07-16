import { describe, expect, it } from "vitest";
import {
  applyTaskCardRefinements,
  buildTaskCardRefinementPrompt,
  parseTaskCardRefinementFromGeminiResponse,
} from "@/services/geminiTaskCardService";

describe("gemini task card service", () => {
  it("applies only exact candidate refinements and preserves deterministic fields", () => {
    const result = applyTaskCardRefinements(
      [
        {
          priority: 3,
          title: "deterministic task",
          reason: "official reason",
          checks: [{ label: "official check", done: false }],
          durationMin: 20,
          sources: [{ name: "official source", url: "https://example.test/source" }],
          dueInDays: 3,
        },
      ],
      [
        {
          title: "deterministic task",
          reason: "refined reason",
          checks: ["refined check"],
          priority: 2,
          sourceNames: ["official source"],
        },
        {
          title: "hallucinated new task",
          reason: "unsupported reason",
          checks: ["unsupported check"],
          priority: 1,
          sourceNames: [],
        },
      ],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "deterministic task",
      reason: "refined reason",
      priority: 2,
      dueInDays: 3,
      sources: [{ name: "official source", url: "https://example.test/source" }],
      checks: [{ label: "refined check", done: false }],
    });
  });

  it("builds a grounded prompt from deterministic task cards and official sources", () => {
    const prompt = buildTaskCardRefinementPrompt({
      cropName: "tomato",
      todayIso: "2026-05-07T00:00:00.000Z",
      drafts: [
        {
          priority: 3,
          title: "농작업일정 실행: side shoot pruning",
          reason: "tomato 5월 농작업일정 기준",
          checks: [{ label: "side shoot pruning 적용 여부 확인", done: false }],
          durationMin: 20,
          sources: [{ name: "농사로 농작업일정: tomato schedule", url: "https://example.test/work.pdf" }],
          dueInDays: 3,
        },
      ],
    });

    expect(prompt).toContain("tomato");
    expect(prompt).toContain("side shoot pruning");
    expect(prompt).toContain("https://example.test/work.pdf");
    expect(prompt).toContain("공식 API 근거");
    expect(prompt).toContain("새 작업을 만들지 말고");
  });

  it("parses Gemini JSON response into bounded task card refinements", () => {
    const result = parseTaskCardRefinementFromGeminiResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: "```json\n{\"cards\":[{\"title\":\"Check irrigation\",\"reason\":\"Official schedule source\",\"checks\":[\"Inspect soil moisture\",\"Record action\"],\"priority\":2,\"sourceNames\":[\"Nongsaro\"]}]}\n```",
              },
            ],
          },
        },
      ],
    });

    expect(result).toEqual([
      {
        title: "Check irrigation",
        reason: "Official schedule source",
        checks: ["Inspect soil moisture", "Record action"],
        priority: 2,
        sourceNames: ["Nongsaro"],
      },
    ]);
  });
});
