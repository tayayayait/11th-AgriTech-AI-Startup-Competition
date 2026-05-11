import { describe, expect, it } from "vitest";
import { buildDashboardRiskOverview, getDashboardDisasterSourceState } from "@/domain/dashboard/dashboardPresentation";

describe("dashboard presentation helpers", () => {
  it("separates weather risk from pest verification risk in the total score", () => {
    const overview = buildDashboardRiskOverview({
      weather: {
        score: 0,
        summary: "Weather risk signal is low.",
        sourceStatus: "connected",
      },
      pestRisks: [
        {
          candidateName: "Rice pest verification recommendation",
          score: 25,
          reasons: ["NCPMS crop pest candidates 5 items checked"],
          officialSourceCount: 5,
        },
      ],
    });

    expect(overview.totalScore).toBe(25);
    expect(overview.totalDriverKey).toBe("pest");
    expect(overview.sections).toEqual([
      expect.objectContaining({ key: "weather", score: 0, apiName: "기상청_단기예보 조회서비스" }),
      expect.objectContaining({
        key: "pest",
        score: 25,
        apiName: "국가농작물병해충관리시스템(NCPMS) OpenAPI",
      }),
    ]);
    expect(overview.summaryBullets).toEqual([
      "기상 위험 0점: Weather risk signal is low.",
      "병해충 확인 권고 25점: NCPMS crop pest candidates 5 items checked",
    ]);
  });

  it("marks disaster prevention sources as not applicable when KMA thresholds are not met", () => {
    const state = getDashboardDisasterSourceState({
      temperature: 19.9,
      precipitation: 0,
      wind: 4.8,
      humidity: 59,
    });

    expect(state.status).toBe("not_applicable");
    expect(state.apiName).toBe("농사로 Open API - 농작물재해예방정보");
    expect(state.message).toContain("조회 조건 없음");
  });
});
