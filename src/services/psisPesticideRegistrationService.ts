import { invokeApiAdapter } from "@/services/api/edgeAdapter";
import type { ApiAdapterResponse, ApiRequestParams } from "@/services/api/types";

type PsisServiceCode = "SVC01" | "SVC02";

interface PsisProxyRequest {
  serviceCode: PsisServiceCode;
  params?: ApiRequestParams;
}

interface PsisProxyResponse extends ApiAdapterResponse<unknown, "psis"> {
  source: "psis";
  serviceCode: PsisServiceCode;
  fetchedAt: string;
}

interface PsisFetchResponse<TItem extends Record<string, unknown> = Record<string, unknown>>
  extends ApiAdapterResponse<unknown, "psis"> {
  source: "psis";
  serviceCode: PsisServiceCode;
  service: Record<string, unknown>;
  items: TItem[];
}

export interface PsisPesticideRegistrationSearchInput {
  cropName: string;
  targetKeyword?: string;
  itemKeyword?: string;
  maxPreHarvestDays?: number | null;
  displayCount?: number;
  startPoint?: number;
}

export interface PsisPesticideRegistrationItem {
  id: string;
  pestiCode: string;
  diseaseUseSeq: string;
  cropName: string;
  diseaseWeedName: string;
  useName: string;
  pestiKorName: string;
  pestiBrandName: string;
  compName: string;
  activeIngredient: string | null;
  manufactureType: string | null;
  mechanism: string | null;
  firstRegisteredAt: string | null;
  cropCode: string | null;
  cropGroupCode: string | null;
  cropGroupName: string | null;
  useMethod: string | null;
  dilution: string | null;
  preHarvestInterval: string | null;
  maxUseCount: string | null;
  preHarvestDays: number | null;
  maxUses: number | null;
}

export interface PsisPesticideRegistrationDetail extends PsisPesticideRegistrationItem {
  pestiEngName: string | null;
  registeredComponentQuantity: string | null;
  toxicityCode: string | null;
  toxicityName: string | null;
  fishToxicityCode: string | null;
}

export interface PsisPesticideRegistrationSearchResult {
  items: PsisPesticideRegistrationItem[];
  totalCount: number;
  fetchedAt: string;
  targetSuggestions?: PsisRegisteredTargetSuggestion[];
  targetSuggestionReason?: "target_not_found";
}

export interface PsisRegisteredTargetSuggestion {
  targetName: string;
  itemCount: number;
  sampleBrands: string[];
  matchedKeyword: string;
}

const TARGET_SUGGESTION_DISPLAY_COUNT = 50;
const TARGET_SUGGESTION_LIMIT = 8;
const TARGET_SUGGESTION_SUFFIXES = [
  "썩음병",
  "곰팡이병",
  "무늬병",
  "마름병",
  "시들음병",
  "흰가루병",
  "탄저병",
  "노균병",
  "역병",
  "녹병",
  "벌레",
  "충",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNullableString(value: unknown): string | null {
  const text = toStringValue(value);
  return text ? text : null;
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = toStringValue(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = toNumberValue(value);
  if (parsed === null) return null;
  const integer = Math.floor(parsed);
  return integer > 0 ? integer : null;
}

function normalizeDisplayCount(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

function extractService(data: unknown): Record<string, unknown> {
  if (!isRecord(data)) return {};
  const service = data.service;
  return isRecord(service) ? service : data;
}

function extractItems<TItem extends Record<string, unknown>>(service: Record<string, unknown>): TItem[] {
  const list = service.list ?? service.items ?? service.item;
  if (Array.isArray(list)) return list.filter(isRecord) as TItem[];
  if (isRecord(list)) return [list as TItem];
  return [];
}

function throwIfPsisError(service: Record<string, unknown>): void {
  const errorCode = toStringValue(service.errorCode);
  if (!errorCode) return;
  const message = toStringValue(service.errorMsg) || "PSIS API request failed.";
  throw new Error(`${message} (${errorCode})`);
}

async function fetchPsis<TItem extends Record<string, unknown> = Record<string, unknown>>(
  serviceCode: PsisServiceCode,
  params?: ApiRequestParams,
): Promise<PsisFetchResponse<TItem>> {
  const response = await invokeApiAdapter<PsisProxyResponse, PsisProxyRequest>("psis", "psis-proxy", {
    serviceCode,
    params,
  });
  const service = extractService(response.data);
  throwIfPsisError(service);

  return {
    source: response.source,
    fetchedAt: response.fetchedAt,
    serviceCode: response.serviceCode,
    data: response.data,
    service,
    items: extractItems<TItem>(service),
  };
}

export function parsePreHarvestDays(value: string | null | undefined): number | null {
  const match = value?.match(/(\d+)\s*일/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseMaxUseCount(value: string | null | undefined): number | null {
  const match = value?.match(/(\d+)\s*회/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRegistrationItem(item: Record<string, unknown>): PsisPesticideRegistrationItem | null {
  const pestiCode = toStringValue(item.pestiCode);
  const diseaseUseSeq = toStringValue(item.diseaseUseSeq);
  const cropName = toStringValue(item.cropName);
  const diseaseWeedName = toStringValue(item.diseaseWeedName);
  const pestiKorName = toStringValue(item.pestiKorName);
  const pestiBrandName = toStringValue(item.pestiBrandName);
  if (!pestiCode || !diseaseUseSeq || !cropName || !diseaseWeedName || !pestiKorName || !pestiBrandName) {
    return null;
  }

  const preHarvestInterval = toNullableString(item.useSuittime);
  const maxUseCount = toNullableString(item.useNum);

  return {
    id: `${pestiCode}:${diseaseUseSeq}`,
    pestiCode,
    diseaseUseSeq,
    cropName,
    diseaseWeedName,
    useName: toStringValue(item.useName),
    pestiKorName,
    pestiBrandName,
    compName: toStringValue(item.compName),
    activeIngredient: toNullableString(item.engName),
    manufactureType: toNullableString(item.cmpaItmNm),
    mechanism: toNullableString(item.indictSymbl),
    firstRegisteredAt: toNullableString(item.applyFirstRegDate),
    cropCode: toNullableString(item.cropCd),
    cropGroupCode: toNullableString(item.cropLrclCd),
    cropGroupName: toNullableString(item.cropLrclNm),
    useMethod: toNullableString(item.pestiUse),
    dilution: toNullableString(item.dilutUnit),
    preHarvestInterval,
    maxUseCount,
    preHarvestDays: parsePreHarvestDays(preHarvestInterval),
    maxUses: parseMaxUseCount(maxUseCount),
  };
}

function normalizeRegistrationDetail(
  service: Record<string, unknown>,
  keys: { pestiCode: string; diseaseUseSeq: string },
): PsisPesticideRegistrationDetail | null {
  const base = normalizeRegistrationItem({
    ...service,
    pestiCode: keys.pestiCode,
    diseaseUseSeq: keys.diseaseUseSeq,
    engName: service.pestiEngName,
    cmpaItmNm: service.cmpaItmNm,
  });
  if (!base) return null;

  return {
    ...base,
    pestiEngName: toNullableString(service.pestiEngName),
    registeredComponentQuantity: toNullableString(service.regCpntQnty),
    toxicityCode: toNullableString(service.toxicGubun),
    toxicityName: toNullableString(service.toxicName),
    fishToxicityCode: toNullableString(service.fishToxicGubun),
  };
}

function buildListParams(input: PsisPesticideRegistrationSearchInput, itemField?: "pestiKorName" | "pestiBrandName"): ApiRequestParams {
  const targetKeyword = input.targetKeyword?.trim() ?? "";
  const itemKeyword = input.itemKeyword?.trim() ?? "";

  return {
    serviceType: "AA001",
    displayCount: normalizeDisplayCount(input.displayCount),
    startPoint: toPositiveInteger(input.startPoint) ?? 1,
    cropName: input.cropName.trim(),
    cropCheck: "Y",
    diseaseWeedName: targetKeyword || undefined,
    similarFlag: targetKeyword ? "Y" : "N",
    pestiKorName: itemField === "pestiKorName" ? itemKeyword : undefined,
    pestiBrandName: itemField === "pestiBrandName" ? itemKeyword : undefined,
  };
}

function buildTargetSuggestionKeywords(targetKeyword: string): string[] {
  const normalized = targetKeyword.replace(/\s+/g, "").trim();
  if (!normalized) return [];

  const keywords = new Set<string>();
  for (const suffix of TARGET_SUGGESTION_SUFFIXES) {
    if (normalized.includes(suffix) && normalized !== suffix) {
      keywords.add(suffix);
    }
  }

  return Array.from(keywords).slice(0, 3);
}

function normalizeTargetForCompare(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function addTargetSuggestions(
  byTarget: Map<string, PsisRegisteredTargetSuggestion>,
  items: PsisPesticideRegistrationItem[],
  matchedKeyword: string,
): void {
  for (const item of items) {
    const targetName = item.diseaseWeedName.trim();
    if (!targetName) continue;

    const existing = byTarget.get(targetName) ?? {
      targetName,
      itemCount: 0,
      sampleBrands: [],
      matchedKeyword,
    };
    existing.itemCount += 1;
    if (item.pestiBrandName && existing.sampleBrands.length < 3 && !existing.sampleBrands.includes(item.pestiBrandName)) {
      existing.sampleBrands.push(item.pestiBrandName);
    }
    byTarget.set(targetName, existing);
  }
}

async function getTargetSuggestions(
  input: PsisPesticideRegistrationSearchInput,
): Promise<PsisRegisteredTargetSuggestion[]> {
  const targetKeyword = input.targetKeyword?.trim() ?? "";
  const keywords = buildTargetSuggestionKeywords(targetKeyword);
  if (keywords.length === 0) return [];

  const byTarget = new Map<string, PsisRegisteredTargetSuggestion>();
  for (const keyword of keywords) {
    const result = await requestRegistrationList({
      ...input,
      targetKeyword: keyword,
      itemKeyword: undefined,
      displayCount: TARGET_SUGGESTION_DISPLAY_COUNT,
      startPoint: 1,
    });
    addTargetSuggestions(byTarget, result.items, keyword);
  }

  return Array.from(byTarget.values())
    .sort((left, right) => {
      const countDiff = right.itemCount - left.itemCount;
      if (countDiff !== 0) return countDiff;
      return left.targetName.localeCompare(right.targetName, "ko");
    })
    .slice(0, TARGET_SUGGESTION_LIMIT);
}

async function requestRegistrationList(
  input: PsisPesticideRegistrationSearchInput,
  itemField?: "pestiKorName" | "pestiBrandName",
): Promise<PsisPesticideRegistrationSearchResult> {
  const response = await fetchPsis("SVC01", buildListParams(input, itemField));
  const normalizedItems = response.items
    .map(normalizeRegistrationItem)
    .filter((item): item is PsisPesticideRegistrationItem => item !== null);
  const targetKeyword = input.targetKeyword?.trim() ?? "";
  const targetCompareKey = normalizeTargetForCompare(targetKeyword);
  const exactTargetItems = targetCompareKey
    ? normalizedItems.filter((item) => normalizeTargetForCompare(item.diseaseWeedName) === targetCompareKey)
    : [];
  const sourceItems = exactTargetItems.length > 0 ? exactTargetItems : normalizedItems;
  const items = sourceItems
    .filter((item) => {
      if (input.maxPreHarvestDays == null) return true;
      return item.preHarvestDays !== null && item.preHarvestDays <= input.maxPreHarvestDays;
    });

  return {
    items,
    totalCount: exactTargetItems.length > 0
      ? exactTargetItems.length
      : toPositiveInteger(response.service.totalCount) ?? items.length,
    fetchedAt: response.fetchedAt,
  };
}

export async function getPsisPesticideRegistrations(
  input: PsisPesticideRegistrationSearchInput,
): Promise<PsisPesticideRegistrationSearchResult> {
  if (!input.cropName.trim()) {
    return { items: [], totalCount: 0, fetchedAt: new Date().toISOString() };
  }

  const itemKeyword = input.itemKeyword?.trim() ?? "";
  const targetKeyword = input.targetKeyword?.trim() ?? "";
  if (!itemKeyword) {
    const primary = await requestRegistrationList(input);
    if (targetKeyword && primary.items.length === 0) {
      const targetSuggestions = await getTargetSuggestions(input);
      return targetSuggestions.length > 0
        ? { ...primary, targetSuggestions, targetSuggestionReason: "target_not_found" }
        : primary;
    }
    return primary;
  }

  const byItemName = await requestRegistrationList(input, "pestiKorName");
  if (byItemName.items.length > 0) return byItemName;

  return requestRegistrationList(input, "pestiBrandName");
}

export async function getPsisPesticideRegistrationDetail(input: {
  pestiCode: string;
  diseaseUseSeq: string;
}): Promise<PsisPesticideRegistrationDetail | null> {
  const pestiCode = input.pestiCode.trim();
  const diseaseUseSeq = input.diseaseUseSeq.trim();
  if (!pestiCode || !diseaseUseSeq) return null;

  const response = await fetchPsis("SVC02", {
    pestiCode,
    diseaseUseSeq,
  });

  return normalizeRegistrationDetail(response.service, { pestiCode, diseaseUseSeq });
}
