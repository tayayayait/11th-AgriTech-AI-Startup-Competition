import { describe, expect, it } from "vitest";
import { normalizeNongsaroUrl } from "@/domain/nongsaro/common";

describe("normalizeNongsaroUrl", () => {
  it("upgrades browser-facing Nongsaro download URLs to HTTPS", () => {
    expect(
      normalizeNongsaroUrl(
        "http://www.nongsaro.go.kr/portal/contentsFileDownload.do?ep=sample-token",
      ),
    ).toBe("https://www.nongsaro.go.kr/portal/contentsFileDownload.do?ep=sample-token");
  });

  it("keeps non-www API URLs unchanged", () => {
    expect(normalizeNongsaroUrl("http://api.nongsaro.go.kr/file/rice-schedule.pdf")).toBe(
      "http://api.nongsaro.go.kr/file/rice-schedule.pdf",
    );
  });

  it("normalizes relative paths against the public Nongsaro host", () => {
    expect(normalizeNongsaroUrl("/portal/contentsFileDownload.do?ep=rice")).toBe(
      "https://www.nongsaro.go.kr/portal/contentsFileDownload.do?ep=rice",
    );
  });
});
