import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/geminiClient", () => ({
  analyzeWithGemini: vi.fn(),
}));

import { analyzeWithGemini } from "@/services/geminiClient";
import {
  buildWeeklyFarmAlternativeBriefingPrompt,
  generateWeeklyFarmAlternativeBriefing,
  parseWeeklyFarmAlternativeBriefingFromGeminiResponse,
} from "@/services/weeklyFarmAlternativeBriefingService";

describe("weekly farm alternative briefing service", () => {
  const analyzeWithGeminiMock = vi.mocked(analyzeWithGemini);

  beforeEach(() => {
    analyzeWithGeminiMock.mockReset();
  });

  it("generates a crop-agnostic AI reference briefing when the weekly PDF has no direct crop content", async () => {
    analyzeWithGeminiMock.mockResolvedValue({
      source: "gemini",
      model: "gemini-3-flash-preview",
      fetchedAt: "2026-05-11T00:00:00.000Z",
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    headline: "아스파라거스 AI 참고 농사 브리핑",
                    summaryBullets: ["AI 참고: 5월에는 생육 상태와 토양 수분을 우선 점검합니다."],
                    actionBullets: ["새순 생육과 토양 수분 상태를 확인합니다."],
                    cautionBullets: ["공식 주간농사정보 근거가 아니므로 현장 상태와 원문을 확인합니다."],
                  }),
                },
              ],
            },
          },
        ],
      },
    });

    const briefing = await generateWeeklyFarmAlternativeBriefing({
      cropName: "아스파라거스",
      field: { name: "테스트 필지", growthStage: "생육기" },
      weather: { temperature: 24, humidity: 70, sourceStatus: "connected" },
      today: new Date("2026-05-11T00:00:00.000Z"),
    });

    expect(briefing.headline).toBe("아스파라거스 AI 참고 농사 브리핑");
    expect(briefing.actionBullets).toEqual(["새순 생육과 토양 수분 상태를 확인합니다."]);
    expect(briefing.evidenceSources).toEqual([
      {
        name: "AI 내부 지식 기반 참고(공식 주간농사정보 근거 없음)",
        url: null,
      },
    ]);
    expect(analyzeWithGeminiMock).toHaveBeenCalledTimes(1);
    const request = analyzeWithGeminiMock.mock.calls[0][0];
    expect(JSON.stringify(request)).toContain("아스파라거스");
    expect(JSON.stringify(request)).toContain("공식 주간농사정보 PDF에서 selected_crop 직접 근거가 확인되지 않았습니다.");
    expect(JSON.stringify(request)).toContain("농약명, 희석배수, 수확 전 사용일수");
  });

  it("keeps the prompt explicit that the result is AI reference, not official weekly evidence", () => {
    const prompt = buildWeeklyFarmAlternativeBriefingPrompt({
      cropName: "새작물",
      today: new Date("2026-05-11T00:00:00.000Z"),
    });

    expect(prompt).toContain("모델 내부 농업 지식");
    expect(prompt).toContain("AI 참고");
    expect(prompt).toContain("확실한 정보 없음");
    expect(prompt).toContain("selected_crop: 새작물");
  });

  it("rejects Gemini output that omits required caution boundaries", () => {
    expect(() =>
      parseWeeklyFarmAlternativeBriefingFromGeminiResponse({
        headline: "새작물 AI 참고 농사 브리핑",
        summaryBullets: ["AI 참고: 생육 상태를 확인합니다."],
        actionBullets: ["토양 수분을 확인합니다."],
      }),
    ).toThrow("Gemini weekly alternative briefing JSON schema mismatch.");
  });
});
