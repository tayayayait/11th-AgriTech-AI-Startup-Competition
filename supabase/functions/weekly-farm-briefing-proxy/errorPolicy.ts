const DEGRADED_WEEKLY_BRIEFING_ERROR_CODES = new Set([
  "upstream_timeout",
  "unsupported_weekly_document",
]);

export function shouldReturnDegradedWeeklyBriefing(code: string | null | undefined): boolean {
  return Boolean(code && DEGRADED_WEEKLY_BRIEFING_ERROR_CODES.has(code));
}
