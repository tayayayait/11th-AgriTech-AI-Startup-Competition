import { describe, expect, it } from "vitest";
import {
  buildPesticideQuickSummary,
  resolvePesticideProductMedia,
} from "@/services/pesticidePresentation";

describe("pesticidePresentation", () => {
  it("공식 제조사 이미지가 등록된 상표는 제품 미디어를 찾는다", () => {
    const media = resolvePesticideProductMedia(["다이센엠-45", "다이센엠45"]);

    expect(media).toMatchObject({
      brandName: "다이센엠45",
      sourceLabel: "팜한농 공식 제품 이미지",
    });
    expect(media?.imageUrl).toMatch(/^https:\/\/www\.farmhannong\.com\/files\/products\//);
    expect(media?.productPageUrl).toContain("seq=4952");
  });

  it("공식 이미지가 확인되지 않은 상표에는 임의 이미지를 제공하지 않는다", () => {
    expect(resolvePesticideProductMedia(["등록되지 않은 제품"])).toBeNull();
  });

  it("AI가 정리한 사용법과 안전기준을 작물·적용대상 문장과 함께 요약한다", () => {
    expect(buildPesticideQuickSummary({
      cropName: "배추",
      targetName: "반쪽시들음병",
      plainUse: "병이 발생하기 시작할 때 경엽처리하며, 2,000배로 희석해 사용합니다.",
      safetyNote: "수확 7일 전까지만 사용할 수 있고, 최대 3회까지 사용 가능합니다.",
    })).toBe(
      "이 농약은 배추의 반쪽시들음병 방제에 등록된 제품입니다. 병이 발생하기 시작할 때 경엽처리하며, 2,000배로 희석해 사용합니다. 수확 7일 전까지만 사용할 수 있고, 최대 3회까지 사용 가능합니다.",
    );
  });
});
