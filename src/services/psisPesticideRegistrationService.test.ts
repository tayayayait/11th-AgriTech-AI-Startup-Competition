import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeApiAdapter } from "@/services/api/edgeAdapter";
import {
  getPsisPesticideRegistrationDetail,
  getPsisPesticideRegistrations,
  parseMaxUseCount,
  parsePreHarvestDays,
} from "@/services/psisPesticideRegistrationService";

vi.mock("@/services/api/edgeAdapter", () => ({
  invokeApiAdapter: vi.fn(),
}));

const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);

const response = (serviceCode: "SVC01" | "SVC02", service: Record<string, unknown>) => ({
  source: "psis" as const,
  serviceCode,
  fetchedAt: "2026-05-11T00:00:00.000Z",
  data: { service },
});

describe("PSIS pesticide registration service", () => {
  beforeEach(() => {
    invokeApiAdapterMock.mockReset();
  });

  it("calls the PSIS proxy without exposing apiKey from the browser", async () => {
    invokeApiAdapterMock.mockResolvedValue(response("SVC01", {
      totalCount: "1",
      list: [
        {
          pestiCode: "973",
          diseaseUseSeq: "1",
          cropName: "벼",
          diseaseWeedName: "세균벼알마름병",
          useName: "살균",
          pestiKorName: "가스가마이신 액제",
          pestiBrandName: "가스가민",
          compName: "(주)동방아그로",
          engName: "kasugamycin SL2.3 %",
          pestiUse: "출수 전부터 경엽처리",
          dilutUnit: "1000배 -",
          useSuittime: "수확14일전",
          useNum: "5회",
        },
      ],
    }));

    const result = await getPsisPesticideRegistrations({
      cropName: "벼",
      targetKeyword: "세균벼알마름병",
    });

    expect(invokeApiAdapterMock).toHaveBeenCalledWith("psis", "psis-proxy", {
      serviceCode: "SVC01",
      params: expect.objectContaining({
        serviceType: "AA001",
        cropName: "벼",
        cropCheck: "Y",
        diseaseWeedName: "세균벼알마름병",
        similarFlag: "Y",
      }),
    });
    expect(result.items[0]).toMatchObject({
      pestiBrandName: "가스가민",
      dilution: "1000배 -",
      preHarvestDays: 14,
      maxUses: 5,
    });
  });

  it("falls back from item name to brand name search", async () => {
    invokeApiAdapterMock
      .mockResolvedValueOnce(response("SVC01", { totalCount: "0", list: [] }))
      .mockResolvedValueOnce(response("SVC01", {
        totalCount: "1",
        list: [
          {
            pestiCode: "100",
            diseaseUseSeq: "7",
            cropName: "토마토",
            diseaseWeedName: "잿빛곰팡이병",
            useName: "살균",
            pestiKorName: "메파니피림 수화제",
            pestiBrandName: "팡파르",
            compName: "회사",
            useSuittime: "수확7일전",
            useNum: "3회",
          },
        ],
      }));

    const result = await getPsisPesticideRegistrations({
      cropName: "토마토",
      targetKeyword: "잿빛곰팡이병",
      itemKeyword: "팡파르",
    });

    expect(invokeApiAdapterMock).toHaveBeenNthCalledWith(1, "psis", "psis-proxy", expect.objectContaining({
      params: expect.objectContaining({ pestiKorName: "팡파르", pestiBrandName: undefined }),
    }));
    expect(invokeApiAdapterMock).toHaveBeenNthCalledWith(2, "psis", "psis-proxy", expect.objectContaining({
      params: expect.objectContaining({ pestiBrandName: "팡파르", pestiKorName: undefined }),
    }));
    expect(result.items[0].pestiBrandName).toBe("팡파르");
  });

  it("returns PSIS registered target suggestions when an exact target has no items", async () => {
    invokeApiAdapterMock
      .mockResolvedValueOnce(response("SVC01", { totalCount: "0", list: [] }))
      .mockResolvedValueOnce(response("SVC01", {
        totalCount: "3",
        list: [
          {
            pestiCode: "200",
            diseaseUseSeq: "1",
            cropName: "포도",
            diseaseWeedName: "흰빛썩음병",
            useName: "살균",
            pestiKorName: "메트코나졸 수화제",
            pestiBrandName: "메가킹",
            compName: "회사",
            useSuittime: "수확14일전",
            useNum: "3회",
          },
          {
            pestiCode: "201",
            diseaseUseSeq: "1",
            cropName: "포도",
            diseaseWeedName: "흰빛썩음병",
            useName: "살균",
            pestiKorName: "디티아논 수화제",
            pestiBrandName: "다놀라",
            compName: "회사",
            useSuittime: "수확21일전",
            useNum: "3회",
          },
        ],
      }));

    const result = await getPsisPesticideRegistrations({
      cropName: "포도",
      targetKeyword: "큰송이썩음병",
    });

    expect(invokeApiAdapterMock).toHaveBeenNthCalledWith(1, "psis", "psis-proxy", expect.objectContaining({
      params: expect.objectContaining({ diseaseWeedName: "큰송이썩음병" }),
    }));
    expect(invokeApiAdapterMock).toHaveBeenNthCalledWith(2, "psis", "psis-proxy", expect.objectContaining({
      params: expect.objectContaining({ diseaseWeedName: "썩음병", displayCount: 50 }),
    }));
    expect(result.items).toEqual([]);
    expect(result.targetSuggestionReason).toBe("target_not_found");
    expect(result.targetSuggestions?.[0]).toMatchObject({
      targetName: "흰빛썩음병",
      itemCount: 2,
      sampleBrands: ["메가킹", "다놀라"],
      matchedKeyword: "썩음병",
    });
  });

  it("keeps exact target registrations when PSIS similar search also returns other targets", async () => {
    invokeApiAdapterMock.mockResolvedValue(response("SVC01", {
      totalCount: "2",
      list: [
        {
          pestiCode: "200",
          diseaseUseSeq: "1",
          cropName: "포도",
          diseaseWeedName: "흰빛썩음병",
          useName: "살균",
          pestiKorName: "메트코나졸 수화제",
          pestiBrandName: "메가킹",
          compName: "회사",
          useSuittime: "수확7일전",
          useNum: "4회",
        },
        {
          pestiCode: "201",
          diseaseUseSeq: "1",
          cropName: "포도",
          diseaseWeedName: "흰얼룩병",
          useName: "살균",
          pestiKorName: "폴리옥신디 입상수화제",
          pestiBrandName: "잘류프리",
          compName: "회사",
          useSuittime: "수확7일전",
          useNum: "3회",
        },
      ],
    }));

    const result = await getPsisPesticideRegistrations({
      cropName: "포도",
      targetKeyword: "흰빛썩음병",
    });

    expect(result.totalCount).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].diseaseWeedName).toBe("흰빛썩음병");
    expect(result.items[0].pestiBrandName).toBe("메가킹");
  });

  it("normalizes detail response with requested detail keys", async () => {
    invokeApiAdapterMock.mockResolvedValue(response("SVC02", {
      pestiKorName: "가스가마이신 액제",
      useName: "살균",
      compName: "(주)동방아그로",
      pestiBrandName: "가스가민",
      pestiEngName: "Kasugamycin",
      regCpntQnty: "2.3",
      toxicGubun: "4",
      toxicName: "저독성",
      fishToxicGubun: "Ⅲ급",
      cropName: "벼",
      diseaseWeedName: "세균벼알마름병",
      pestiUse: "출수 전부터 경엽처리",
      dilutUnit: "1000배 -",
      useSuittime: "수확14일전",
      useNum: "5회",
    }));

    const detail = await getPsisPesticideRegistrationDetail({
      pestiCode: "973",
      diseaseUseSeq: "1",
    });

    expect(detail).toMatchObject({
      id: "973:1",
      toxicityName: "저독성",
      fishToxicityCode: "Ⅲ급",
      registeredComponentQuantity: "2.3",
    });
  });

  it("parses official safety-use strings conservatively", () => {
    expect(parsePreHarvestDays("수확14일전")).toBe(14);
    expect(parsePreHarvestDays("발생초기")).toBeNull();
    expect(parseMaxUseCount("5회 이내")).toBe(5);
    expect(parseMaxUseCount("-")).toBeNull();
  });
});
