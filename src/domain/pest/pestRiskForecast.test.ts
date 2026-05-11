import { describe, expect, it } from "vitest";
import { buildPestRiskForecast } from "@/domain/pest/pestRiskForecast";

describe("pest risk forecast", () => {
  it("combines KMA weather and official sources without diagnostic wording", () => {
    const forecast = buildPestRiskForecast({
      cropName: "벼",
      weather: {
        temperature: 26,
        precipitation: 24,
        wind: 4,
        humidity: 88,
      },
      weatherRiskScore: 55,
      officialSources: [
        { type: "npms", title: "논벼 병: 이삭도열병" },
        { type: "disaster", title: "농작물 고온해 위험 예측보고" },
      ],
    });

    expect(forecast.candidateName).toBe("벼 병해충 위험 예보/확인 권고");
    expect(forecast.score).toBeGreaterThanOrEqual(70);
    expect(forecast.reasons).toEqual(
      expect.arrayContaining([
        "고습 조건으로 병 발생 가능성 확인 필요",
        "강수 후 병해충 발생 가능성 확인 필요",
        "농사로 재해예방자료 1건 확인",
        "NCPMS 작물별 참고 후보 1건 제공",
      ]),
    );
    expect(forecast.officialSources).toEqual(
      expect.arrayContaining([
        "NCPMS 병해충정보: 논벼 병: 이삭도열병",
        "재해예방자료: 농작물 고온해 위험 예측보고",
      ]),
    );
    expect(JSON.stringify(forecast)).not.toContain("진단");
  });

  it("still returns a low-risk confirmation forecast when KMA risk is low", () => {
    const forecast = buildPestRiskForecast({
      cropName: "사과",
      weather: {
        temperature: 22,
        precipitation: 0,
        wind: 2,
        humidity: 55,
      },
      weatherRiskScore: 0,
      officialSources: [],
    });

    expect(forecast.score).toBe(0);
    expect(forecast.reasons).toEqual(["현재 KMA 조건상 병해충 위험 신호가 낮음"]);
  });

  it("does not raise risk score from NCPMS catalog candidates alone", () => {
    const forecast = buildPestRiskForecast({
      cropName: "사과",
      weather: {
        temperature: 22,
        precipitation: 0,
        wind: 2,
        humidity: 55,
      },
      weatherRiskScore: 0,
      officialSources: Array.from({ length: 8 }, (_, index) => ({
        type: "npms" as const,
        title: `사과 병: 후보 ${index + 1}`,
      })),
    });

    expect(forecast.score).toBe(0);
    expect(forecast.reasons).toEqual([
      "현재 KMA 조건상 병해충 위험 신호가 낮음",
      "NCPMS 작물별 참고 후보 8건 제공",
    ]);
  });
});
