import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeWithGemini } from "@/services/geminiClient";
import {
  getRepresentativePesticideOptions,
  groupPesticideRegistrationItems,
} from "@/services/psisPesticideRecommendationService";
import type { PsisPesticideRegistrationItem } from "@/services/psisPesticideRegistrationService";

vi.mock("@/services/geminiClient", () => ({
  analyzeWithGemini: vi.fn(),
}));

const analyzeWithGeminiMock = vi.mocked(analyzeWithGemini);

function item(overrides: Partial<PsisPesticideRegistrationItem>): PsisPesticideRegistrationItem {
  return {
    id: overrides.id ?? `${overrides.pestiCode ?? "100"}:${overrides.diseaseUseSeq ?? "1"}`,
    pestiCode: overrides.pestiCode ?? "100",
    diseaseUseSeq: overrides.diseaseUseSeq ?? "1",
    cropName: overrides.cropName ?? "복숭아",
    diseaseWeedName: overrides.diseaseWeedName ?? "잿빛무늬병",
    useName: overrides.useName ?? "살균",
    pestiKorName: overrides.pestiKorName ?? "디메토모르프·메트코나졸 액상수화제",
    pestiBrandName: overrides.pestiBrandName ?? "곰파스",
    compName: overrides.compName ?? "회사",
    activeIngredient: overrides.activeIngredient ?? "Dimethomorph·Metconazole",
    manufactureType: overrides.manufactureType ?? null,
    mechanism: overrides.mechanism ?? "아5+사1",
    firstRegisteredAt: overrides.firstRegisteredAt ?? null,
    cropCode: overrides.cropCode ?? null,
    cropGroupCode: overrides.cropGroupCode ?? null,
    cropGroupName: overrides.cropGroupName ?? null,
    useMethod: overrides.useMethod ?? "발병 초부터 경엽처리",
    dilution: overrides.dilution ?? "3000배",
    preHarvestInterval: overrides.preHarvestInterval ?? "수확21일전",
    maxUseCount: overrides.maxUseCount ?? "3회",
    preHarvestDays: overrides.preHarvestDays ?? 21,
    maxUses: overrides.maxUses ?? 3,
  };
}

describe("PSIS pesticide representative options", () => {
  beforeEach(() => {
    analyzeWithGeminiMock.mockReset();
  });

  it("groups equivalent official records by ingredient and use standard", () => {
    const groups = groupPesticideRegistrationItems([
      item({ id: "1:1", pestiCode: "1", pestiBrandName: "곰파스", compName: "A" }),
      item({ id: "2:1", pestiCode: "2", pestiBrandName: "하드코어", compName: "B" }),
      item({
        id: "3:1",
        pestiCode: "3",
        pestiKorName: "디티아논·메트코나졸 입상수화제",
        pestiBrandName: "리스펙트",
        activeIngredient: "Dithianon·Metconazole",
        dilution: "1500배",
        preHarvestInterval: "수확14일전",
        preHarvestDays: 14,
        maxUseCount: "4회",
        maxUses: 4,
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].items.map((entry) => entry.pestiBrandName)).toEqual(["곰파스", "하드코어"]);
  });

  it("uses Gemini to select representative groups and hides raw action codes from farmer text", async () => {
    analyzeWithGeminiMock.mockResolvedValueOnce({
      source: "gemini",
      model: "gemini-test",
      fetchedAt: "2026-05-11T00:00:00.000Z",
      data: {
        options: [
          {
            groupId: "group-2",
            farmerTitle: "수확 전 기간이 짧은 후보",
            whySelected: "작용기작 아5+사1 대신 비교하기 쉬운 후보입니다.",
            plainUse: "발병 초기에 라벨 기준으로 확인하세요.",
            safetyNote: "수확 전 기준과 횟수를 확인하세요.",
          },
          {
            groupId: "group-1",
            farmerTitle: "기본 등록 후보",
            whySelected: "사용방법과 희석배수가 분명합니다.",
            plainUse: "발병 초부터 경엽처리로 표시되어 있습니다.",
            safetyNote: "수확 21일 전 기준을 확인하세요.",
          },
          {
            groupId: "group-3",
            farmerTitle: "다른 성분 후보",
            whySelected: "상표 중복을 줄인 비교 후보입니다.",
            plainUse: "제품 라벨 기준으로 확인하세요.",
            safetyNote: "사용횟수 제한을 확인하세요.",
          },
        ],
      },
    });

    const result = await getRepresentativePesticideOptions({
      cropName: "복숭아",
      targetKeyword: "잿빛무늬병",
      maxOptions: 3,
      items: [
        item({ id: "1:1", pestiCode: "1", pestiBrandName: "곰파스" }),
        item({
          id: "2:1",
          pestiCode: "2",
          pestiBrandName: "리스펙트",
          pestiKorName: "디티아논·메트코나졸 입상수화제",
          activeIngredient: "Dithianon·Metconazole",
          dilution: "1500배",
          preHarvestInterval: "수확14일전",
          preHarvestDays: 14,
        }),
        item({
          id: "3:1",
          pestiCode: "3",
          pestiBrandName: "벨리스플러스",
          pestiKorName: "보스칼리드·피라클로스트로빈 입상수화제",
          activeIngredient: "Boscalid·Pyraclostrobin",
          dilution: "2000배",
        }),
        item({
          id: "4:1",
          pestiCode: "4",
          pestiBrandName: "푸름이",
          pestiKorName: "테부코나졸 수화제",
          activeIngredient: "Tebuconazole",
          dilution: "1000배",
        }),
      ],
    });

    expect(result.selectionSource).toBe("gemini");
    expect(result.options).toHaveLength(3);
    expect(result.options[0].farmerTitle).toBe("수확 전 기간이 짧은 후보");
    expect(result.options[0].whySelected).not.toContain("아5+사1");
    expect(analyzeWithGeminiMock).toHaveBeenCalledTimes(1);
  });
});
