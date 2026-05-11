import { describe, expect, it } from "vitest";
import { buildFarmmapFieldDetail } from "@/domain/farmmap/detail";
import type { FieldRow } from "@/domain/fields/types";

function fieldWithRaw(raw: Record<string, unknown>): FieldRow {
  return {
    id: "field-1",
    name: "경기도 고양시 덕양구 강매동 1-5",
    address: "경기도 고양시 덕양구 강매동 1-5",
    lat: 37.6,
    lng: 126.8,
    crop_name: "밭",
    growth_stage: null,
    area_m2: 881.3,
    pnu: "4128112400100010005",
    farmmap_meta: {
      source: "farmmap_region_lookup",
      classification: "밭",
      legalDongAddress: "경기도 고양시 덕양구 강매동",
      representativePnu: "4128112400100010005",
      areaM2: 881.3,
      raw,
    },
    risk_level: "unknown",
    risk_score: 0,
    updated_at: "2026-05-07T00:00:00.000Z",
  };
}

describe("buildFarmmapFieldDetail", () => {
  it("extracts Farmmap and linked cadastral information from WFS properties", () => {
    const detail = buildFarmmapFieldDetail(fieldWithRaw({
      clsf_nm: "밭",
      area: 881.3,
      cad_con_ra: 63.28,
      flight_ymd: "2024-12-31",
      updt_ymd: "2025-01-02",
      stdg_addr: "경기도 고양시 덕양구 강매동 1-5",
      ldcg_cd: "철",
      pnu: "4128112400100010005",
      ownershipType: "국유지",
      cadastralArea: 3705.1,
      cultivatedArea: 557.7,
      arableRate: 15.1,
      farmmapFieldCount: 1,
    }));

    expect(detail.farmmapInfo).toMatchObject({
      classification: "밭",
      areaM2: 881.3,
      cadastralMatchRate: 63.28,
      aerialPhotoYear: "2024",
      updateYear: "2025",
      representativeAddress: "경기도 고양시 덕양구 강매동 1-5",
    });
    expect(detail.linkedCadastralInfos[0]).toMatchObject({
      landCategory: "철",
      areaM2: 3705.1,
      ownershipType: "국유지",
      pnu: "4128112400100010005",
      cultivatedAreaM2: 557.7,
      arableRate: 15.1,
      farmmapFieldCount: 1,
    });
  });

  it("adds subsidiary PNU as a second linked cadastral record", () => {
    const detail = buildFarmmapFieldDetail(fieldWithRaw({
      pnu: "4128112400100010005",
      sb_pnu: "4128112400100010006",
      ldcg_cd: "전",
      sb_ldcg_cd: "답",
      area: 1000,
    }));

    expect(detail.linkedCadastralInfos).toHaveLength(2);
    expect(detail.linkedCadastralInfos[1]).toMatchObject({
      landCategory: "답",
      pnu: "4128112400100010006",
    });
  });

  it("does not invent cultivation analysis values when only WFS fields are available", () => {
    const detail = buildFarmmapFieldDetail(fieldWithRaw({
      pnu: "4311231038103240004",
      clsf_nm: "밭",
      area: 1655.4,
      stdg_addr: "충청북도 청주시 서원구 남이면 가마리",
    }));

    expect(detail.linkedCadastralInfos[0]).toMatchObject({
      cultivatedAreaM2: null,
      arableRate: null,
      farmmapFieldCount: null,
    });
  });

  it("overlays cultivation analysis values when PNU analysis is available", () => {
    const detail = buildFarmmapFieldDetail(
      fieldWithRaw({
        pnu: "4128112400100090002",
        clsf_nm: "밭",
        area: 488.8,
      }),
      {
        pnu: "4128112400100090002",
        jimok: "전",
        basearea: 2610.1,
        farm_cnt: 2,
        farm_area: 583.8,
        farm_ratio: 22.4,
      },
    );

    expect(detail.linkedCadastralInfos[0]).toMatchObject({
      landCategory: "전",
      areaM2: 2610.1,
      cultivatedAreaM2: 583.8,
      arableRate: 22.4,
      farmmapFieldCount: 2,
    });
  });
});
