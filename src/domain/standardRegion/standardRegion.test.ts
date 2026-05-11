import { describe, expect, it } from "vitest";
import {
  parentRegionCode,
  parseStandardRegionCodeResult,
  standardRegionLevel,
} from "@/domain/standardRegion/standardRegion";

const jsonPayload = {
  StanReginCd: [
    {
      head: [
        { totalCount: "2" },
        { numOfRows: "2", pageNo: "1", type: "JSON" },
      ],
    },
    {
      row: [
        {
          region_cd: "4100000000",
          sido_cd: "41",
          sgg_cd: "000",
          umd_cd: "000",
          ri_cd: "00",
          locatadd_nm: "경기도",
          locathigh_cd: "0000000000",
          locallow_nm: "경기도",
        },
        {
          region_cd: "4128112800",
          sido_cd: "41",
          sgg_cd: "281",
          umd_cd: "128",
          ri_cd: "00",
          locatadd_nm: "경기도 고양시 덕양구 강매동",
          locathigh_cd: "4128100000",
          locallow_nm: "강매동",
        },
      ],
    },
  ],
};

describe("standard region code parser", () => {
  it("normalizes JSON rows from the public data portal shape", () => {
    const result = parseStandardRegionCodeResult(jsonPayload);

    expect(result.totalCount).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toMatchObject({
      regionCode: "4128112800",
      addressName: "경기도 고양시 덕양구 강매동",
      highRegionCode: "4128100000",
      lowName: "강매동",
    });
  });

  it("derives hierarchy levels and fallback parent codes", () => {
    const result = parseStandardRegionCodeResult(jsonPayload);

    expect(standardRegionLevel(result.rows[0])).toBe("sido");
    expect(standardRegionLevel(result.rows[1])).toBe("eupMyeonDong");
    expect(parentRegionCode("4128112800")).toBe("4128100000");
  });

  it("parses XML fallback payloads", () => {
    const result = parseStandardRegionCodeResult({
      raw: `
        <StanReginCd>
          <head><totalCount>1</totalCount><numOfRows>1</numOfRows><pageNo>1</pageNo></head>
          <row>
            <region_cd>1100000000</region_cd>
            <sido_cd>11</sido_cd>
            <sgg_cd>000</sgg_cd>
            <umd_cd>000</umd_cd>
            <ri_cd>00</ri_cd>
            <locatadd_nm>서울특별시</locatadd_nm>
            <locathigh_cd>0000000000</locathigh_cd>
            <locallow_nm>서울특별시</locallow_nm>
          </row>
        </StanReginCd>
      `,
    });

    expect(result.rows[0]).toMatchObject({
      regionCode: "1100000000",
      addressName: "서울특별시",
    });
  });

  it("parses raw JSON fallback payloads", () => {
    const result = parseStandardRegionCodeResult({
      raw: JSON.stringify(jsonPayload),
    });

    expect(result.totalCount).toBe(2);
    expect(result.rows[1]).toMatchObject({
      regionCode: "4128112800",
      addressName: "경기도 고양시 덕양구 강매동",
    });
  });
});
