import { describe, expect, it } from "vitest";
import { shouldReturnDegradedWeeklyBriefing } from "../../supabase/functions/weekly-farm-briefing-proxy/errorPolicy";

describe("weekly farm briefing proxy error policy", () => {
  it("returns degraded success for recoverable PDF processing failures", () => {
    expect(shouldReturnDegradedWeeklyBriefing("upstream_timeout")).toBe(true);
    expect(shouldReturnDegradedWeeklyBriefing("unsupported_weekly_document")).toBe(true);
  });

  it("keeps invalid requests as hard HTTP errors", () => {
    expect(shouldReturnDegradedWeeklyBriefing("invalid_content_type")).toBe(false);
    expect(shouldReturnDegradedWeeklyBriefing("missing_source_url")).toBe(false);
    expect(shouldReturnDegradedWeeklyBriefing("invalid_source_url_host")).toBe(false);
  });
});
