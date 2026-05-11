import { z } from "zod";
import { analyzeWithGemini } from "@/services/geminiClient";
import type { PsisPesticideRegistrationItem } from "@/services/psisPesticideRegistrationService";

export type PesticideRepresentativeSource = "gemini" | "official_grouped" | "official_fallback";

export interface PesticideRepresentativeOption {
  id: string;
  cropName: string;
  targetName: string;
  useName: string;
  groupName: string;
  farmerTitle: string;
  whySelected: string;
  plainUse: string;
  safetyNote: string;
  brandNames: string[];
  companyNames: string[];
  activeIngredient: string | null;
  officialUseMethod: string | null;
  officialDilution: string | null;
  officialPreHarvestInterval: string | null;
  officialMaxUseCount: string | null;
  representativeItem: PsisPesticideRegistrationItem;
  sourceItemCount: number;
}

export interface PesticideRepresentativeResult {
  options: PesticideRepresentativeOption[];
  groupCount: number;
  selectionSource: PesticideRepresentativeSource;
}

export interface GetRepresentativePesticideOptionsInput {
  items: PsisPesticideRegistrationItem[];
  cropName: string;
  targetKeyword?: string;
  maxOptions?: number;
  signal?: AbortSignal;
}

export interface PesticideRegistrationGroup {
  id: string;
  key: string;
  representativeItem: PsisPesticideRegistrationItem;
  items: PsisPesticideRegistrationItem[];
  firstIndex: number;
}

const MIN_GEMINI_OPTIONS = 3;
const DEFAULT_MAX_OPTIONS = 5;
const MAX_GROUPS_FOR_GEMINI = 28;

const geminiOptionSchema = z.object({
  groupId: z.string().trim().min(1),
  farmerTitle: z.string().trim().min(1).max(80),
  whySelected: z.string().trim().min(1).max(180),
  plainUse: z.string().trim().min(1).max(180),
  safetyNote: z.string().trim().min(1).max(180),
});

const geminiSelectionSchema = z.object({
  options: z.array(geminiOptionSchema).min(1).max(DEFAULT_MAX_OPTIONS),
});

const uniqueText = (items: Array<string | null | undefined>): string[] =>
  Array.from(new Set(items.map((item) => item?.trim()).filter((item): item is string => !!item)));

const officialValue = (value: string | null | undefined): string => value?.trim() || "확실한 정보 없음";

const normalizeGroupPart = (value: string | null | undefined): string => value?.trim().toLowerCase() || "-";

const clampOptionCount = (value: number | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_OPTIONS;
  return Math.max(1, Math.min(DEFAULT_MAX_OPTIONS, Math.floor(value)));
};

const buildGroupKey = (item: PsisPesticideRegistrationItem): string =>
  [
    item.cropName,
    item.diseaseWeedName,
    item.useName,
    item.pestiKorName,
    item.activeIngredient,
    item.useMethod,
    item.dilution,
    item.preHarvestInterval,
    item.maxUseCount,
  ].map(normalizeGroupPart).join("|");

export function groupPesticideRegistrationItems(items: PsisPesticideRegistrationItem[]): PesticideRegistrationGroup[] {
  const byKey = new Map<string, PesticideRegistrationGroup>();

  items.forEach((item, index) => {
    const key = buildGroupKey(item);
    const existing = byKey.get(key);
    if (existing) {
      existing.items.push(item);
      return;
    }

    byKey.set(key, {
      id: `group-${byKey.size + 1}`,
      key,
      representativeItem: item,
      items: [item],
      firstIndex: index,
    });
  });

  return Array.from(byKey.values());
}

function groupCompletenessScore(group: PesticideRegistrationGroup): number {
  const item = group.representativeItem;
  return [
    item.useMethod,
    item.dilution,
    item.preHarvestInterval,
    item.maxUseCount,
    item.activeIngredient,
  ].filter((value) => !!value?.trim()).length;
}

function sortGroupsForSelection(groups: PesticideRegistrationGroup[]): PesticideRegistrationGroup[] {
  return [...groups].sort((left, right) => {
    const scoreDiff = groupCompletenessScore(right) - groupCompletenessScore(left);
    if (scoreDiff !== 0) return scoreDiff;

    const leftDays = left.representativeItem.preHarvestDays ?? Number.MAX_SAFE_INTEGER;
    const rightDays = right.representativeItem.preHarvestDays ?? Number.MAX_SAFE_INTEGER;
    if (leftDays !== rightDays) return leftDays - rightDays;

    return left.firstIndex - right.firstIndex;
  });
}

function buildDefaultUse(item: PsisPesticideRegistrationItem): string {
  const method = officialValue(item.useMethod);
  const dilution = officialValue(item.dilution);
  if (method === "확실한 정보 없음" && dilution === "확실한 정보 없음") {
    return "공식 등록정보에 사용방법과 희석/사용량이 충분히 표시되지 않았습니다.";
  }
  return `사용 시기/방법은 '${method}', 희석 또는 10a당 사용량은 '${dilution}'로 확인됩니다.`;
}

function buildDefaultSafety(item: PsisPesticideRegistrationItem): string {
  const parts: string[] = [];
  if (item.preHarvestDays !== null) parts.push(`수확 ${item.preHarvestDays}일 전 기준`);
  if (item.maxUses !== null) parts.push(`${item.maxUses}회 이내`);
  if (parts.length > 0) return `${parts.join(", ")}를 넘기지 않도록 제품 라벨을 확인하세요.`;

  const interval = officialValue(item.preHarvestInterval);
  const count = officialValue(item.maxUseCount);
  return `공식 안전사용기준은 '${interval}', '${count}'로 확인됩니다.`;
}

function sanitizeAiText(value: string | null | undefined, group: PesticideRegistrationGroup, fallback: string): string {
  let text = value?.trim() || fallback;
  const mechanism = group.representativeItem.mechanism?.trim();
  if (mechanism) {
    text = text.split(mechanism).join("같은 작용 방식");
  }
  return text.replace(/\s+/g, " ").trim();
}

function toRepresentativeOption(
  group: PesticideRegistrationGroup,
  aiOption?: z.infer<typeof geminiOptionSchema>,
): PesticideRepresentativeOption {
  const item = group.representativeItem;
  const brandNames = uniqueText(group.items.map((entry) => entry.pestiBrandName));
  const companyNames = uniqueText(group.items.map((entry) => entry.compName));
  const groupName = officialValue(item.pestiKorName);
  const defaultTitle = brandNames.length > 1 ? `${groupName} 계열` : officialValue(item.pestiBrandName);

  return {
    id: group.id,
    cropName: item.cropName,
    targetName: item.diseaseWeedName,
    useName: item.useName,
    groupName,
    farmerTitle: sanitizeAiText(aiOption?.farmerTitle, group, defaultTitle),
    whySelected: sanitizeAiText(
      aiOption?.whySelected,
      group,
      "같은 성분과 같은 사용기준의 상표를 하나로 묶어 중복을 줄인 대표 후보입니다.",
    ),
    plainUse: sanitizeAiText(aiOption?.plainUse, group, buildDefaultUse(item)),
    safetyNote: sanitizeAiText(aiOption?.safetyNote, group, buildDefaultSafety(item)),
    brandNames,
    companyNames,
    activeIngredient: item.activeIngredient,
    officialUseMethod: item.useMethod,
    officialDilution: item.dilution,
    officialPreHarvestInterval: item.preHarvestInterval,
    officialMaxUseCount: item.maxUseCount,
    representativeItem: item,
    sourceItemCount: group.items.length,
  };
}

function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return text.trim();
}

function parseJsonText(text: string): unknown {
  const cleaned = stripFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Gemini pesticide representative JSON parse failed.");
  }
}

function extractGeminiJson(responseData: unknown): unknown {
  if (!responseData || typeof responseData !== "object") {
    throw new Error("Gemini pesticide representative response is empty.");
  }

  const source = responseData as Record<string, unknown>;
  if ("options" in source) return source;

  if (Array.isArray(source.candidates)) {
    for (const candidate of source.candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const content = (candidate as Record<string, unknown>).content;
      if (!content || typeof content !== "object") continue;
      const parts = (content as Record<string, unknown>).parts;
      if (!Array.isArray(parts)) continue;

      for (const part of parts) {
        if (!part || typeof part !== "object") continue;
        const text = (part as Record<string, unknown>).text;
        if (typeof text === "string" && text.trim()) return parseJsonText(text);
      }
    }
  }

  throw new Error("Gemini pesticide representative JSON was not found.");
}

export function parsePesticideRepresentativeSelectionFromGemini(responseData: unknown): Array<z.infer<typeof geminiOptionSchema>> {
  const payload = extractGeminiJson(responseData);
  const parsed = geminiSelectionSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Gemini pesticide representative JSON schema mismatch.");
  }
  return parsed.data.options;
}

function getRepresentativeSelectionJsonSchema(maxOptions: number): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      options: {
        type: "array",
        minItems: Math.min(MIN_GEMINI_OPTIONS, maxOptions),
        maxItems: maxOptions,
        items: {
          type: "object",
          properties: {
            groupId: { type: "string" },
            farmerTitle: { type: "string" },
            whySelected: { type: "string" },
            plainUse: { type: "string" },
            safetyNote: { type: "string" },
          },
          required: ["groupId", "farmerTitle", "whySelected", "plainUse", "safetyNote"],
        },
      },
    },
    required: ["options"],
  };
}

function buildGeminiSelectionPrompt(input: GetRepresentativePesticideOptionsInput, groups: PesticideRegistrationGroup[], maxOptions: number): string {
  const officialGroups = groups.map((group) => {
    const item = group.representativeItem;
    return {
      groupId: group.id,
      cropName: item.cropName,
      targetName: item.diseaseWeedName,
      useName: item.useName,
      itemName: item.pestiKorName,
      activeIngredient: item.activeIngredient,
      actionCodeForDiversityOnly: item.mechanism,
      useMethod: item.useMethod,
      dilutionOrAmount: item.dilution,
      preHarvestInterval: item.preHarvestInterval,
      maxUseCount: item.maxUseCount,
      brandNames: uniqueText(group.items.map((entry) => entry.pestiBrandName)).slice(0, 8),
      brandCount: group.items.length,
    };
  });

  return [
    "당신은 농약 처방자가 아니라 농약안전정보시스템 공식 등록정보를 초보 농업인이 읽기 쉽게 정리하는 보조자입니다.",
    `아래 공식 등록농약 그룹 중 대표 ${Math.min(MIN_GEMINI_OPTIONS, maxOptions)}~${maxOptions}개만 고르세요.`,
    "새 농약명, 새 사용법, 새 희석비율, 새 안전기준을 만들면 안 됩니다. 반드시 제공된 groupId 안에서만 선택하세요.",
    "선택 기준은 1) 같은 상표 중복 제거, 2) 사용방법/희석 또는 사용량/수확 전 기준/사용횟수가 분명한 후보, 3) 가능하면 서로 다른 성분 또는 작용 방식 후보를 비교할 수 있게 구성하는 것입니다.",
    "작용기작 코드(예: 아5+사1 같은 코드)는 farmerTitle, whySelected, plainUse, safetyNote에 쓰지 마세요. 초보 농업인이 이해할 수 있는 말로만 설명하세요.",
    "확정 진단, 자동 처방, 반드시 사용하라는 표현은 금지입니다. '확인하세요', '비교하세요', '라벨 확인' 표현을 사용하세요.",
    "반드시 JSON 객체만 출력하세요. markdown과 코드블록은 금지입니다.",
    "JSON 형식: {\"options\":[{\"groupId\":\"group-1\",\"farmerTitle\":\"\",\"whySelected\":\"\",\"plainUse\":\"\",\"safetyNote\":\"\"}]}",
    `조회 작물: ${input.cropName || "확실한 정보 없음"}`,
    `조회 적용대상: ${input.targetKeyword || "확실한 정보 없음"}`,
    "공식 등록농약 그룹:",
    JSON.stringify(officialGroups, null, 2),
  ].join("\n");
}

async function selectRepresentativeGroupsWithGemini(input: GetRepresentativePesticideOptionsInput, groups: PesticideRegistrationGroup[], maxOptions: number) {
  const reviewGroups = groups.slice(0, MAX_GROUPS_FOR_GEMINI);
  const response = await analyzeWithGemini(
    {
      contents: [
        {
          role: "user",
          parts: [{ text: buildGeminiSelectionPrompt(input, reviewGroups, maxOptions) }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: getRepresentativeSelectionJsonSchema(maxOptions),
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 1800,
      },
    },
    { signal: input.signal, timeout: 25000 },
  );

  return parsePesticideRepresentativeSelectionFromGemini(response.data);
}

function buildOptionsFromSelection(
  rankedGroups: PesticideRegistrationGroup[],
  selection: Array<z.infer<typeof geminiOptionSchema>>,
  maxOptions: number,
): PesticideRepresentativeOption[] {
  const byId = new Map(rankedGroups.map((group) => [group.id, group]));
  const selected: PesticideRepresentativeOption[] = [];
  const used = new Set<string>();

  for (const option of selection) {
    const group = byId.get(option.groupId);
    if (!group || used.has(group.id)) continue;
    selected.push(toRepresentativeOption(group, option));
    used.add(group.id);
    if (selected.length >= maxOptions) break;
  }

  const minimumCount = Math.min(MIN_GEMINI_OPTIONS, maxOptions, rankedGroups.length);
  for (const group of rankedGroups) {
    if (selected.length >= minimumCount && selected.length >= Math.min(maxOptions, rankedGroups.length)) break;
    if (selected.length >= maxOptions) break;
    if (used.has(group.id)) continue;
    selected.push(toRepresentativeOption(group));
    used.add(group.id);
  }

  return selected.slice(0, maxOptions);
}

function buildFallbackOptions(groups: PesticideRegistrationGroup[], maxOptions: number): PesticideRepresentativeOption[] {
  return groups.slice(0, maxOptions).map((group) => toRepresentativeOption(group));
}

export async function getRepresentativePesticideOptions(
  input: GetRepresentativePesticideOptionsInput,
): Promise<PesticideRepresentativeResult> {
  const maxOptions = clampOptionCount(input.maxOptions);
  const rankedGroups = sortGroupsForSelection(groupPesticideRegistrationItems(input.items));

  if (rankedGroups.length === 0) {
    return { options: [], groupCount: 0, selectionSource: "official_grouped" };
  }

  if (rankedGroups.length <= maxOptions) {
    return {
      options: buildFallbackOptions(rankedGroups, maxOptions),
      groupCount: rankedGroups.length,
      selectionSource: "official_grouped",
    };
  }

  try {
    const selection = await selectRepresentativeGroupsWithGemini(input, rankedGroups, maxOptions);
    const options = buildOptionsFromSelection(rankedGroups, selection, maxOptions);
    if (options.length > 0) {
      return { options, groupCount: rankedGroups.length, selectionSource: "gemini" };
    }
  } catch {
    return {
      options: buildFallbackOptions(rankedGroups, maxOptions),
      groupCount: rankedGroups.length,
      selectionSource: "official_fallback",
    };
  }

  return {
    options: buildFallbackOptions(rankedGroups, maxOptions),
    groupCount: rankedGroups.length,
    selectionSource: "official_fallback",
  };
}
