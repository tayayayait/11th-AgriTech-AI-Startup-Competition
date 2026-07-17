import { describe, expect, it, vi } from "vitest";
import { buildPsisCatalogRows } from "../../supabase/functions/psis-proxy/catalog";
import { persistPsisCatalog } from "../../supabase/functions/psis-proxy/persistence";

describe("PSIS pesticide catalog normalization", () => {
  it("deduplicates products while preserving every registered use", () => {
    const rows = buildPsisCatalogRows({
      serviceCode: "SVC01",
      fetchedAt: "2026-07-17T01:00:00.000Z",
      params: { cropName: "배추", diseaseWeedName: "반쪽시들음병" },
      service: {
        totalCount: "2",
        list: [
          {
            pestiCode: "7912",
            diseaseUseSeq: "83",
            cropName: "배추",
            diseaseWeedName: "반쪽시들음병",
            useName: "살균제",
            pestiKorName: "메티트리플루코나졸 액상수화제",
            pestiBrandName: "레빅사",
            compName: "한국삼공(주)",
            engName: "mefentrifluconazole 10%",
            pestiUse: "발병 초부터 경엽처리",
            dilutUnit: "2000배 -",
            useSuittime: "수확7일전",
            useNum: "3회 이내",
          },
          {
            pestiCode: "7912",
            diseaseUseSeq: "84",
            cropName: "배추",
            diseaseWeedName: "균핵병",
            useName: "살균제",
            pestiKorName: "메티트리플루코나졸 액상수화제",
            pestiBrandName: "레빅사",
            compName: "한국삼공(주)",
            engName: "mefentrifluconazole 10%",
            pestiUse: "발병 초부터 경엽처리",
            dilutUnit: "2000배 -",
            useSuittime: "수확7일전",
            useNum: "3회 이내",
          },
        ],
      },
    });

    expect(rows.products).toHaveLength(1);
    expect(rows.products[0]).toMatchObject({
      pesti_code: "7912",
      item_name: "메티트리플루코나졸 액상수화제",
      brand_name: "레빅사",
      company_name: "한국삼공(주)",
      last_seen_at: "2026-07-17T01:00:00.000Z",
    });
    expect(rows.registrations).toHaveLength(2);
    expect(rows.registrations[0]).toMatchObject({
      pesti_code: "7912",
      disease_use_seq: "83",
      crop_name: "배추",
      target_name: "반쪽시들음병",
      pre_harvest_days: 7,
      max_uses: 3,
    });
  });

  it("uses SVC02 request keys and keeps detail-only safety fields", () => {
    const rows = buildPsisCatalogRows({
      serviceCode: "SVC02",
      fetchedAt: "2026-07-17T02:00:00.000Z",
      params: { pestiCode: "973", diseaseUseSeq: "1" },
      service: {
        pestiKorName: "가스가마이신 액제",
        pestiBrandName: "가스가민",
        compName: "농업회사",
        pestiEngName: "Kasugamycin",
        regCpntQnty: "2.3",
        toxicGubun: "4",
        toxicName: "저독성",
        fishToxicGubun: "Ⅲ급",
        cropName: "벼",
        diseaseWeedName: "세균벼알마름병",
        pestiUse: "출수 전후 경엽처리",
        dilutUnit: "1000배 -",
        useSuittime: "수확14일전",
        useNum: "5회 이내",
      },
    });

    expect(rows.products[0]).toMatchObject({
      pesti_code: "973",
      active_ingredient: "Kasugamycin",
      registered_component_quantity: "2.3",
      toxicity_name: "저독성",
      fish_toxicity_code: "Ⅲ급",
    });
    expect(rows.registrations[0]).toMatchObject({
      pesti_code: "973",
      disease_use_seq: "1",
      pre_harvest_days: 14,
      max_uses: 5,
    });
  });

  it("skips records that cannot form stable PSIS keys", () => {
    const rows = buildPsisCatalogRows({
      serviceCode: "SVC01",
      fetchedAt: "2026-07-17T03:00:00.000Z",
      params: {},
      service: {
        list: [
          { pestiCode: "", diseaseUseSeq: "1", pestiBrandName: "잘못된 제품" },
          { pestiCode: "100", diseaseUseSeq: "", pestiBrandName: "적용번호 없음" },
        ],
      },
    });

    expect(rows.products).toEqual([]);
    expect(rows.registrations).toEqual([]);
    expect(rows.skippedCount).toBe(2);
  });

  it("upserts product masters before registrations and records the sync result", async () => {
    const calls: string[] = [];
    const client = {
      from(table: string) {
        return {
          async upsert() {
            calls.push(`upsert:${table}`);
            return { error: null };
          },
          async insert() {
            calls.push(`insert:${table}`);
            return { error: null };
          },
        };
      },
    };

    const result = await persistPsisCatalog(client as never, {
      serviceCode: "SVC01",
      fetchedAt: "2026-07-17T04:00:00.000Z",
      startedAt: "2026-07-17T03:59:59.000Z",
      params: { cropName: "배추" },
      service: {
        list: [{
          pestiCode: "7912",
          diseaseUseSeq: "83",
          pestiKorName: "메티트리플루코나졸 액상수화제",
          pestiBrandName: "레빅사",
          cropName: "배추",
          diseaseWeedName: "반쪽시들음병",
        }],
      },
    });

    expect(result).toEqual({
      status: "stored",
      products: 1,
      registrations: 1,
      skipped: 0,
    });
    expect(calls).toEqual([
      "upsert:psis_pesticide_products",
      "upsert:psis_pesticide_registrations",
      "insert:psis_pesticide_sync_runs",
    ]);
  });

  it("keeps the upstream request usable when catalog persistence fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = {
      from(table: string) {
        return {
          async upsert() {
            return { error: new Error("database unavailable") };
          },
          async insert() {
            return {
              error: table === "psis_pesticide_sync_runs"
                ? null
                : new Error("database unavailable"),
            };
          },
        };
      },
    };

    const result = await persistPsisCatalog(client as never, {
      serviceCode: "SVC01",
      fetchedAt: "2026-07-17T05:00:00.000Z",
      startedAt: "2026-07-17T04:59:59.000Z",
      params: {},
      service: {
        list: [{
          pestiCode: "7912",
          diseaseUseSeq: "83",
          pestiKorName: "메티트리플루코나졸 액상수화제",
          pestiBrandName: "레빅사",
        }],
      },
    });

    expect(result).toEqual({ status: "failed" });
    consoleError.mockRestore();
  });
});
