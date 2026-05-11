import { describe, expect, it } from "vitest";
import {
  buildPnuFromLegalRegionLot,
  formatLegalRegionLotAddress,
  isParcelSearchableRegion,
  normalizeLotInput,
} from "@/domain/standardRegion/pnu";
import type { StandardRegionCodeRow } from "@/domain/standardRegion/types";

function row(regionCode: string): StandardRegionCodeRow {
  return {
    regionCode,
    sidoCode: regionCode.slice(0, 2),
    sigunguCode: regionCode.slice(2, 5),
    eupMyeonDongCode: regionCode.slice(5, 8),
    riCode: regionCode.slice(8, 10),
    residentRegionCode: null,
    cadastralRegionCode: null,
    addressName: "경상북도 구미시 옥계동",
    order: null,
    note: null,
    highRegionCode: "0000000000",
    lowName: null,
    createdDate: null,
    raw: {},
  };
}

describe("standard region PNU helpers", () => {
  it("builds a 19 digit PNU from legal region and lot numbers", () => {
    expect(
      buildPnuFromLegalRegionLot({
        regionCode: "4719012400",
        mainLot: "155",
        subLot: "2",
        isMountain: false,
      }),
    ).toBe("4719012400101550002");
  });

  it("uses the mountain discriminator and defaults sub lot to zero", () => {
    expect(
      buildPnuFromLegalRegionLot({
        regionCode: "4719012400",
        mainLot: "155",
        isMountain: true,
      }),
    ).toBe("4719012400201550000");
  });

  it("rejects incomplete or invalid parcel numbers", () => {
    expect(buildPnuFromLegalRegionLot({ regionCode: "4719012400", mainLot: "" })).toBeNull();
    expect(buildPnuFromLegalRegionLot({ regionCode: "47190124", mainLot: "155" })).toBeNull();
    expect(buildPnuFromLegalRegionLot({ regionCode: "4719012400", mainLot: "0" })).toBeNull();
  });

  it("formats the address shown in the field draft", () => {
    expect(formatLegalRegionLotAddress("경상북도 구미시 옥계동", "155", "2")).toBe(
      "경상북도 구미시 옥계동 155-2",
    );
    expect(formatLegalRegionLotAddress("경상북도 구미시 옥계동", "155", "", true)).toBe(
      "경상북도 구미시 옥계동 산 155",
    );
  });

  it("keeps only four numeric characters in lot inputs", () => {
    expect(normalizeLotInput("12-345")).toBe("1234");
  });

  it("allows eupmyeondong and ri rows for parcel search", () => {
    expect(isParcelSearchableRegion(row("4719012400"))).toBe(true);
    expect(isParcelSearchableRegion(row("4719000000"))).toBe(false);
  });
});
