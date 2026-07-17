import { describe, expect, it } from "vitest";
import {
  normalizeProductLabel,
  resolveOfficialPesticideSource,
} from "../../supabase/functions/pesticide-media-ingest/sourcePolicy";

describe("official pesticide media source policy", () => {
  it("matches PSIS company variants to an official manufacturer domain", () => {
    expect(
      resolveOfficialPesticideSource(
        "(주)팜한농",
        new URL("https://www.farmhannong.com/kor/product/product_ct01/view.do?seq=4952"),
      ),
    ).toMatchObject({
      sourceLabel: "팜한농 공식 제품",
    });

    expect(
      resolveOfficialPesticideSource(
        "한국삼공(주)",
        new URL("https://www.30agro.co.kr/crop_protection_agent/crop_protection_agent_view.php?idx=138"),
      ),
    ).toMatchObject({
      sourceLabel: "한국삼공 공식 제품",
    });
  });

  it("rejects lookalike and unrelated domains", () => {
    expect(
      resolveOfficialPesticideSource(
        "(주)팜한농",
        new URL("https://farmhannong.com.example.org/product.png"),
      ),
    ).toBeNull();

    expect(
      resolveOfficialPesticideSource(
        "(주)동방아그로",
        new URL("https://www.farmhannong.com/product.png"),
      ),
    ).toBeNull();
  });

  it("normalizes company and brand punctuation without dropping Korean text", () => {
    expect(normalizeProductLabel(" (주) 팜한농-캡탄 ")).toBe("팜한농캡탄");
  });
});
