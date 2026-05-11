import { scoreToLevel, type RiskLevel } from "@/domain/risk/risk";
import type { KmaWeatherSnapshot } from "@/domain/weather/kma";

export interface WeatherRiskFactor {
  key: "precipitation" | "high_temperature" | "low_temperature" | "wind" | "humidity";
  score: number;
  reason: string;
}

export interface WeatherRiskAssessment {
  score: number;
  level: RiskLevel;
  summary: string;
  factors: WeatherRiskFactor[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function assessPrecipitation(value: number | null): WeatherRiskFactor | null {
  if (value === null || value <= 0) return null;
  if (value >= 80) return { key: "precipitation", score: 90, reason: `강수 ${round1(value)}mm` };
  if (value >= 50) return { key: "precipitation", score: 80, reason: `강수 ${round1(value)}mm` };
  if (value >= 30) return { key: "precipitation", score: 70, reason: `강수 ${round1(value)}mm` };
  if (value >= 20) return { key: "precipitation", score: 55, reason: `강수 ${round1(value)}mm` };
  return { key: "precipitation", score: 25, reason: `약한 강수 ${round1(value)}mm` };
}

function assessTemperature(value: number | null): WeatherRiskFactor | null {
  if (value === null) return null;

  if (value >= 38) return { key: "high_temperature", score: 90, reason: `고온 ${round1(value)}도` };
  if (value >= 35) return { key: "high_temperature", score: 75, reason: `고온 ${round1(value)}도` };
  if (value >= 33) return { key: "high_temperature", score: 55, reason: `고온 ${round1(value)}도` };

  if (value <= -10) return { key: "low_temperature", score: 90, reason: `저온 ${round1(value)}도` };
  if (value <= -5) return { key: "low_temperature", score: 75, reason: `저온 ${round1(value)}도` };
  if (value <= 0) return { key: "low_temperature", score: 55, reason: `저온 ${round1(value)}도` };

  return null;
}

function assessWind(value: number | null): WeatherRiskFactor | null {
  if (value === null) return null;
  if (value >= 14) return { key: "wind", score: 90, reason: `강풍 ${round1(value)}m/s` };
  if (value >= 9) return { key: "wind", score: 70, reason: `강풍 ${round1(value)}m/s` };
  if (value >= 6) return { key: "wind", score: 45, reason: `강풍 ${round1(value)}m/s` };
  return null;
}

function assessHumidity(value: number | null): WeatherRiskFactor | null {
  if (value === null) return null;
  if (value >= 95) return { key: "humidity", score: 75, reason: `고습 ${round1(value)}%` };
  if (value >= 85) return { key: "humidity", score: 55, reason: `고습 ${round1(value)}%` };
  if (value >= 80) return { key: "humidity", score: 40, reason: `고습 ${round1(value)}%` };
  return null;
}

function combineFactorScores(factors: WeatherRiskFactor[]): number {
  if (!factors.length) return 0;

  const sorted = [...factors].sort((a, b) => b.score - a.score);
  const [highest, ...rest] = sorted;
  const secondaryLoad = rest.reduce((sum, factor) => sum + factor.score * 0.25, 0);
  return Math.min(100, Math.round(highest.score + secondaryLoad));
}

export function assessWeatherRisk(snapshot: KmaWeatherSnapshot): WeatherRiskAssessment {
  const factors = [
    assessPrecipitation(snapshot.precipitation),
    assessTemperature(snapshot.temperature),
    assessWind(snapshot.wind),
    assessHumidity(snapshot.humidity),
  ].filter((factor): factor is WeatherRiskFactor => factor !== null);

  const sortedFactors = factors.sort((a, b) => b.score - a.score);
  const score = combineFactorScores(sortedFactors);
  const level = scoreToLevel(score);
  const summary = sortedFactors.length
    ? sortedFactors.map((factor) => factor.reason).join(", ")
    : "기상 위험 신호가 낮습니다.";

  return {
    score,
    level,
    summary,
    factors: sortedFactors,
  };
}
