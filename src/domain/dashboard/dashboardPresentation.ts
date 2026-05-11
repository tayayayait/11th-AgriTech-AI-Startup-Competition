import { scoreToLevel, type RiskLevel } from "@/domain/risk/risk";
import type { KmaWeatherSnapshot } from "@/domain/weather/kma";
import { getDisasterSearchKeywordsForWeather } from "@/domain/pest/pestRiskForecast";

export type DashboardSourceStatus = "connected" | "delayed" | "unavailable" | "rate_limited";
export type DashboardRiskSectionKey = "weather" | "pest";
export type DashboardDisasterSourceStatus = "not_applicable" | "lookup_ready";

export interface DashboardWeatherRiskInput {
  score: number;
  summary: string | null;
  sourceStatus: DashboardSourceStatus;
}

export interface DashboardPestRiskInput {
  candidateName: string;
  score: number;
  reasons: string[];
  officialSourceCount: number;
}

export interface DashboardRiskSection {
  key: DashboardRiskSectionKey;
  title: string;
  apiName: string;
  score: number;
  level: RiskLevel;
  summary: string;
  meaning: string;
}

export interface DashboardRiskOverview {
  totalScore: number;
  totalLevel: RiskLevel;
  totalDriverKey: DashboardRiskSectionKey;
  sections: DashboardRiskSection[];
  summaryBullets: string[];
  explanation: string;
}

export interface DashboardDisasterSourceState {
  apiName: "농사로 Open API - 농작물재해예방정보";
  status: DashboardDisasterSourceStatus;
  keywords: string[];
  message: string;
}

function normalizeScore(score: number | null | undefined): number {
  if (typeof score !== "number" || !Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function topPestRisk(pestRisks: DashboardPestRiskInput[]): DashboardPestRiskInput | null {
  if (pestRisks.length === 0) return null;
  return pestRisks.reduce((top, current) => (current.score > top.score ? current : top), pestRisks[0]);
}

function firstReason(pestRisk: DashboardPestRiskInput | null): string {
  if (!pestRisk) return "NCPMS 작물별 병해충 후보 기반 확인 권고가 없습니다.";
  return pestRisk.reasons.find((reason) => reason.trim()) ?? pestRisk.candidateName;
}

export function buildDashboardRiskOverview(input: {
  weather: DashboardWeatherRiskInput;
  pestRisks: DashboardPestRiskInput[];
}): DashboardRiskOverview {
  const weatherScore = normalizeScore(input.weather.score);
  const pestRisk = topPestRisk(input.pestRisks);
  const pestScore = normalizeScore(pestRisk?.score);
  const totalDriverKey: DashboardRiskSectionKey = pestScore > weatherScore ? "pest" : "weather";
  const totalScore = Math.max(weatherScore, pestScore);

  const weatherSummary = input.weather.summary?.trim() || "기상 위험 신호를 확인할 수 없습니다.";
  const pestSummary = firstReason(pestRisk);

  const sections: DashboardRiskSection[] = [
    {
      key: "weather",
      title: "기상 위험",
      apiName: "기상청_단기예보 조회서비스",
      score: weatherScore,
      level: scoreToLevel(weatherScore),
      summary: weatherSummary,
      meaning: "필지 좌표를 기상청 격자로 변환해 강수, 기온, 풍속, 습도 조건을 점수화합니다.",
    },
    {
      key: "pest",
      title: "병해충 확인 권고",
      apiName: "국가농작물병해충관리시스템(NCPMS) OpenAPI",
      score: pestScore,
      level: scoreToLevel(pestScore),
      summary: pestSummary,
      meaning: "NCPMS 작물별 병해충 후보와 현재 기상 조건을 함께 보고 현장 확인 필요성을 표시합니다.",
    },
  ];

  return {
    totalScore,
    totalLevel: scoreToLevel(totalScore),
    totalDriverKey,
    sections,
    summaryBullets: [
      `기상 위험 ${weatherScore}점: ${weatherSummary}`,
      `병해충 확인 권고 ${pestScore}점: ${pestSummary}`,
    ],
    explanation: "종합 점수는 기상 위험과 병해충 확인 권고 중 더 높은 점수를 표시합니다.",
  };
}

export function getDashboardDisasterSourceState(weather: KmaWeatherSnapshot): DashboardDisasterSourceState {
  const keywords = getDisasterSearchKeywordsForWeather(weather);
  if (keywords.length === 0) {
    return {
      apiName: "농사로 Open API - 농작물재해예방정보",
      status: "not_applicable",
      keywords,
      message: "현재 기상 조건에서는 농작물재해예방정보 조회 조건 없음",
    };
  }

  return {
    apiName: "농사로 Open API - 농작물재해예방정보",
    status: "lookup_ready",
    keywords,
    message: `재해예방자료 조회 조건 충족: ${keywords.join(", ")}`,
  };
}
