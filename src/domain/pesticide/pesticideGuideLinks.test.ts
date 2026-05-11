import { describe, expect, it } from "vitest";
import { buildPesticideGuideReportUrl } from "@/domain/pesticide/pesticideGuideLinks";

describe("buildPesticideGuideReportUrl", () => {
  it("links a diagnosis candidate to the pesticide guide tab with crop and target query", () => {
    const url = buildPesticideGuideReportUrl({
      cropName: "벼",
      targetKeyword: "깨씨무늬병",
    });

    expect(url).toBe("/reports?tab=pesticide&crop=%EB%B2%BC&target=%EA%B9%A8%EC%94%A8%EB%AC%B4%EB%8A%AC%EB%B3%91");
  });

  it("omits empty query values", () => {
    expect(buildPesticideGuideReportUrl({ cropName: "벼", targetKeyword: "" })).toBe(
      "/reports?tab=pesticide&crop=%EB%B2%BC",
    );
  });
});
