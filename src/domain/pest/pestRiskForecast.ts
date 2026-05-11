import { scoreToLevel, type RiskLevel } from "@/domain/risk/risk";
import type { KmaWeatherSnapshot } from "@/domain/weather/kma";

export type PestRiskSourceType = "pest" | "disaster" | "npms";

export interface PestRiskOfficialSource {
  type: PestRiskSourceType;
  title: string;
  url?: string | null;
}

export interface BuildPestRiskForecastInput {
  cropName: string;
  weather: KmaWeatherSnapshot;
  weatherRiskScore?: number | null;
  officialSources: PestRiskOfficialSource[];
}

export interface PestRiskForecast {
  candidateName: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
  officialSources: string[];
}

const clampScore = (score: number): number => Math.min(100, Math.max(0, Math.round(score)));

const countSources = (sources: PestRiskOfficialSource[], type: PestRiskSourceType): number =>
  sources.filter((source) => source.type === type).length;

const formatOfficialSource = (source: PestRiskOfficialSource): string => {
  const label =
    source.type === "npms"
      ? "NCPMS 병해충정보"
      : source.type === "pest"
        ? "병해충 발생정보"
        : "재해예방자료";
  const title = source.title.trim();
  const url = source.url?.trim();
  return url ? `${label}: ${title} (${url})` : `${label}: ${title}`;
};

const getWeatherRiskReasons = (weather: KmaWeatherSnapshot): Array<{ score: number; reason: string }> => {
  const reasons: Array<{ score: number; reason: string }> = [];

  if (
    weather.humidity !== null &&
    weather.temperature !== null &&
    weather.humidity >= 85 &&
    weather.temperature >= 18 &&
    weather.temperature <= 30
  ) {
    reasons.push({ score: 25, reason: "고습 조건으로 병 발생 가능성 확인 필요" });
  } else if (weather.humidity !== null && weather.humidity >= 80) {
    reasons.push({ score: 15, reason: "습도가 높아 잎마름·곰팡이성 병 확인 필요" });
  }

  if (weather.precipitation !== null && weather.precipitation >= 20) {
    reasons.push({ score: 20, reason: "강수 후 병해충 발생 가능성 확인 필요" });
  } else if (weather.precipitation !== null && weather.precipitation > 0) {
    reasons.push({ score: 8, reason: "강수 후 포장 상태 확인 필요" });
  }

  if (weather.wind !== null && weather.wind >= 9) {
    reasons.push({ score: 12, reason: "강풍 후 상처 부위와 2차 병해 확인 필요" });
  }

  if (weather.temperature !== null && weather.temperature >= 33) {
    reasons.push({ score: 12, reason: "고온 스트레스로 병해충 취약성 확인 필요" });
  }

  if (weather.temperature !== null && weather.temperature <= 0) {
    reasons.push({ score: 12, reason: "저온 스트레스로 생육 이상과 병해 확인 필요" });
  }

  return reasons;
};

export const buildPestRiskForecast = (input: BuildPestRiskForecastInput): PestRiskForecast => {
  const cropName = input.cropName.trim() || "작물";
  const weatherReasons = getWeatherRiskReasons(input.weather);
  const pestSourceCount = countSources(input.officialSources, "pest");
  const npmsSourceCount = countSources(input.officialSources, "npms");
  const disasterSourceCount = countSources(input.officialSources, "disaster");
  const sourceScore = Math.min(25, pestSourceCount * 5 + disasterSourceCount * 10);
  const weatherReasonScore = weatherReasons.reduce((sum, item) => sum + item.score, 0);
  const baseWeatherScore = input.weatherRiskScore ?? 0;
  const score = clampScore(Math.max(baseWeatherScore, 0) + weatherReasonScore + sourceScore);

  const reasons = weatherReasons.map((item) => item.reason);
  if (pestSourceCount > 0) reasons.push(`농사로 병해충 발생정보 ${pestSourceCount}건 확인`);
  if (disasterSourceCount > 0) reasons.push(`농사로 재해예방자료 ${disasterSourceCount}건 확인`);
  if (reasons.length === 0) reasons.push("현재 KMA 조건상 병해충 위험 신호가 낮음");
  if (npmsSourceCount > 0) reasons.push(`NCPMS 작물별 참고 후보 ${npmsSourceCount}건 제공`);

  return {
    candidateName: `${cropName} 병해충 위험 예보/확인 권고`,
    score,
    level: scoreToLevel(score),
    reasons,
    officialSources: input.officialSources
      .filter((source) => source.title.trim())
      .map(formatOfficialSource)
      .slice(0, 8),
  };
};

export const getDisasterSearchKeywordsForWeather = (weather: KmaWeatherSnapshot): string[] => {
  const keywords: string[] = [];
  if (weather.temperature !== null && weather.temperature >= 33) keywords.push("고온");
  if (weather.temperature !== null && weather.temperature <= 0) keywords.push("저온");
  if (weather.precipitation !== null && weather.precipitation >= 20) keywords.push("태풍");
  if (weather.wind !== null && weather.wind >= 9) keywords.push("태풍");
  return Array.from(new Set(keywords));
};
