import { describe, expect, it } from "vitest";
import { assessWeatherRisk } from "@/domain/weather/weatherRisk";

describe("weather risk assessment", () => {
  it("keeps clear weather at low risk", () => {
    const assessment = assessWeatherRisk({
      precipitation: 0,
      temperature: 24,
      wind: 2,
      humidity: 55,
    });

    expect(assessment).toMatchObject({
      score: 0,
      level: "low",
      summary: "기상 위험 신호가 낮습니다.",
    });
    expect(assessment.factors).toEqual([]);
  });

  it("scores heavy rain as a high weather risk", () => {
    const assessment = assessWeatherRisk({
      precipitation: 52,
      temperature: 24,
      wind: 2,
      humidity: 55,
    });

    expect(assessment.score).toBe(80);
    expect(assessment.level).toBe("high");
    expect(assessment.summary).toContain("강수 52mm");
  });

  it("combines multiple moderate signals without exceeding 100", () => {
    const assessment = assessWeatherRisk({
      precipitation: 22,
      temperature: 34,
      wind: 9,
      humidity: 86,
    });

    expect(assessment.score).toBe(100);
    expect(assessment.level).toBe("critical");
    expect(assessment.factors.map((factor) => factor.key)).toEqual([
      "wind",
      "precipitation",
      "high_temperature",
      "humidity",
    ]);
  });

  it("detects low-temperature risk", () => {
    const assessment = assessWeatherRisk({
      precipitation: 0,
      temperature: -6,
      wind: 1,
      humidity: 60,
    });

    expect(assessment.score).toBe(75);
    expect(assessment.level).toBe("high");
    expect(assessment.summary).toContain("저온 -6도");
  });
});
