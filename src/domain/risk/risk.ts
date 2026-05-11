export type RiskLevel = "low" | "watch" | "high" | "critical" | "unknown";

export const RISK_THRESHOLDS = Object.freeze({
  watch: 40,
  high: 70,
  critical: 90,
});

const KNOWN_RISK_LEVELS = new Set<RiskLevel>(["low", "watch", "high", "critical", "unknown"]);

export function scoreToLevel(score: number | null | undefined): RiskLevel {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return "unknown";
  }
  if (score >= RISK_THRESHOLDS.critical) return "critical";
  if (score >= RISK_THRESHOLDS.high) return "high";
  if (score >= RISK_THRESHOLDS.watch) return "watch";
  if (score >= 0) return "low";
  return "unknown";
}

export function normalizeRiskLevel(level: string | null | undefined, score?: number | null): RiskLevel {
  if (level && KNOWN_RISK_LEVELS.has(level as RiskLevel)) {
    return level as RiskLevel;
  }
  return scoreToLevel(score);
}
