import { getNongsaroCropSearchProfile } from "@/domain/nongsaro/cropMapping";
import {
  detectCriticalWeatherIncident,
  type CriticalWeatherIncident,
} from "@/domain/weather/criticalWeatherIncident";
import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import { invokeApiAdapter } from "@/services/api/edgeAdapter";
import type { ApiAdapterResponse } from "@/services/api/types";
import type { NongsaroWeeklyInfo } from "@/services/nongsaroWeeklyService";
import { isWeeklyFarmInfoPersistenceMissing } from "@/services/weeklyFarmInfoPersistenceError";
import { z } from "zod";

export const WEEKLY_BRIEFING_MODEL = "gemini-3-flash-preview";
export const WEEKLY_BRIEFING_CLIENT_TIMEOUT_MS = 30000;

export type WeeklyFarmBriefingCacheStatus = "fresh" | "cached" | "stale" | "unavailable";

export interface WeeklyFarmBriefingFieldContext {
  id?: string | null;
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  growthStage?: string | null;
  areaM2?: number | null;
}

export interface WeeklyFarmBriefingWeatherContext {
  sourceStatus?: string | null;
  collectedAt?: string | null;
  precipitation?: number | null;
  temperature?: number | null;
  wind?: number | null;
  humidity?: number | null;
  riskScore?: number | null;
  riskSummary?: string | null;
}

export interface WeeklyFarmBriefing {
  relevant: boolean;
  headline: string;
  summaryBullets: string[];
  actionBullets: string[];
  cautionBullets: string[];
  weatherBullets: string[];
  pestRiskBullets: string[];
  irrigationBullets: string[];
  growthManagementBullets: string[];
  evidenceSnippets: string[];
  cropName: string;
  cropGroup: string | null;
  fieldContext: WeeklyFarmBriefingFieldContext | null;
  weatherContext: WeeklyFarmBriefingWeatherContext | null;
  contextKey: string;
  baseBriefingKey: string;
  weatherIncidentKey: string;
  weatherIncident: CriticalWeatherIncident | null;
  sourceTitle: string;
  sourceUrl: string;
  publishedAt: string | null;
  model: string;
  fetchedAt: string;
  cacheStatus: WeeklyFarmBriefingCacheStatus;
  errorCode?: string;
}

export interface GetWeeklyFarmBriefingInput {
  cropName: string;
  weeklyInfo: NongsaroWeeklyInfo;
  field?: WeeklyFarmBriefingFieldContext | null;
  weather?: WeeklyFarmBriefingWeatherContext | null;
  forceRefresh?: boolean;
  signal?: AbortSignal;
}

interface WeeklyFarmBriefingProxyRequest {
  sourceUrl: string;
  sourceTitle: string;
  publishedAt: string | null;
  cropName: string;
  cropGroup: string | null;
  field: WeeklyFarmBriefingFieldContext | null;
  weather: WeeklyFarmBriefingWeatherContext | null;
  model: string;
}

interface WeeklyFarmBriefingProxyResponse extends ApiAdapterResponse<unknown, "gemini"> {
  source: "gemini";
  model: string;
  fetchedAt: string;
  sourceUrl: string;
  sourceTitle: string | null;
  publishedAt: string | null;
  status?: "ready" | "degraded";
  errorCode?: string | null;
}

const briefingBulletSchema = z.array(z.string().trim().min(1).max(220)).max(5).default([]);

const weeklyFarmBriefingSchema = z.object({
  relevant: z.boolean(),
  headline: z.string().trim().min(1).max(160),
  summaryBullets: briefingBulletSchema,
  actionBullets: briefingBulletSchema,
  cautionBullets: briefingBulletSchema,
  weatherBullets: briefingBulletSchema,
  pestRiskBullets: briefingBulletSchema,
  irrigationBullets: briefingBulletSchema,
  growthManagementBullets: briefingBulletSchema,
  evidenceSnippets: briefingBulletSchema,
});

const fieldContextSchema = z.object({
  id: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1).nullable().optional(),
  address: z.string().trim().min(1).nullable().optional(),
  lat: z.number().finite().nullable().optional(),
  lng: z.number().finite().nullable().optional(),
  growthStage: z.string().trim().min(1).nullable().optional(),
  areaM2: z.number().finite().nullable().optional(),
}).nullable().default(null);

const weatherContextSchema = z.object({
  sourceStatus: z.string().trim().min(1).nullable().optional(),
  collectedAt: z.string().trim().min(1).nullable().optional(),
  precipitation: z.number().finite().nullable().optional(),
  temperature: z.number().finite().nullable().optional(),
  wind: z.number().finite().nullable().optional(),
  humidity: z.number().finite().nullable().optional(),
  riskScore: z.number().finite().nullable().optional(),
  riskSummary: z.string().trim().min(1).nullable().optional(),
}).nullable().default(null);

const weeklyFarmBriefingCacheSchema = weeklyFarmBriefingSchema.extend({
  cropName: z.string().trim().min(1),
  cropGroup: z.string().trim().min(1).nullable(),
  fieldContext: fieldContextSchema,
  weatherContext: weatherContextSchema,
  contextKey: z.string().trim().min(1).default("legacy"),
  baseBriefingKey: z.string().trim().min(1).optional(),
  weatherIncidentKey: z.string().trim().min(1).default("normal"),
  weatherIncident: z.custom<CriticalWeatherIncident>().nullable().default(null),
  sourceTitle: z.string().trim().min(1),
  sourceUrl: z.string().trim().min(1),
  publishedAt: z.string().nullable(),
  model: z.string().trim().min(1),
  fetchedAt: z.string().trim().min(1),
});

const WEEKLY_BRIEFING_CACHE_PREFIX = "fieldguard.weeklyFarmBriefing.v1";

function cleanString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function hasPdfExtension(value: string | null | undefined): boolean {
  const trimmed = cleanString(value);
  if (!trimmed) return false;

  const decoded = safeDecodeUriComponent(trimmed).toLowerCase();
  const pathWithoutQuery = decoded.split(/[?#]/, 1)[0];
  return pathWithoutQuery.endsWith(".pdf") || /\.pdf(?:$|[?#&=])/i.test(decoded);
}

function uniqueCleanStrings(values: Array<string | null | undefined>): string[] {
  const unique: string[] = [];
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned && !unique.includes(cleaned)) unique.push(cleaned);
  }
  return unique;
}

function getWeeklyFarmBriefingFallbackSourceUrl(weeklyInfo: NongsaroWeeklyInfo): string | null {
  return uniqueCleanStrings([weeklyInfo.sourceUrl, ...weeklyInfo.downUrlList])[0] ?? null;
}

export function getWeeklyFarmBriefingPdfSourceUrl(weeklyInfo: NongsaroWeeklyInfo): string | null {
  const sourceUrl = cleanString(weeklyInfo.sourceUrl);
  if (sourceUrl && hasPdfExtension(weeklyInfo.sourceFileName)) return sourceUrl;

  return uniqueCleanStrings([weeklyInfo.sourceUrl, ...weeklyInfo.downUrlList]).find(hasPdfExtension) ?? null;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeFieldContext(
  field: WeeklyFarmBriefingFieldContext | null | undefined,
): WeeklyFarmBriefingFieldContext | null {
  if (!field) return null;
  return {
    id: cleanString(field.id),
    name: cleanString(field.name),
    address: cleanString(field.address),
    lat: finiteNumber(field.lat),
    lng: finiteNumber(field.lng),
    growthStage: cleanString(field.growthStage),
    areaM2: finiteNumber(field.areaM2),
  };
}

function normalizeWeatherContext(
  weather: WeeklyFarmBriefingWeatherContext | null | undefined,
): WeeklyFarmBriefingWeatherContext | null {
  if (!weather) return null;
  return {
    sourceStatus: cleanString(weather.sourceStatus),
    collectedAt: cleanString(weather.collectedAt),
    precipitation: finiteNumber(weather.precipitation),
    temperature: finiteNumber(weather.temperature),
    wind: finiteNumber(weather.wind),
    humidity: finiteNumber(weather.humidity),
    riskScore: finiteNumber(weather.riskScore),
    riskSummary: cleanString(weather.riskSummary),
  };
}

function buildBaseBriefingKey(weeklyInfo: NongsaroWeeklyInfo, cropName: string): string {
  return [
    weeklyInfo.sourceKey || weeklyInfo.sourceUrl || weeklyInfo.title,
    weeklyInfo.periodStart ?? "",
    weeklyInfo.periodEnd ?? "",
    cropName,
  ].join("|");
}

function buildContextKey(baseBriefingKey: string, weatherIncidentKey: string): string {
  return JSON.stringify({ baseBriefingKey, weatherIncidentKey });
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
    throw new Error("Gemini weekly farm briefing JSON parse failed.");
  }
}

function extractGeminiJson(responseData: unknown): unknown {
  if (!responseData || typeof responseData !== "object") {
    throw new Error("Gemini weekly farm briefing response is empty.");
  }

  const source = responseData as Record<string, unknown>;
  if ("headline" in source) return source;

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

  throw new Error("Gemini weekly farm briefing JSON was not found.");
}

export function parseWeeklyFarmBriefingFromGeminiResponse(responseData: unknown): Omit<
  WeeklyFarmBriefing,
  | "cropName"
  | "cropGroup"
  | "fieldContext"
  | "weatherContext"
  | "contextKey"
  | "sourceTitle"
  | "sourceUrl"
  | "publishedAt"
  | "model"
  | "fetchedAt"
  | "cacheStatus"
  | "errorCode"
> {
  const payload = extractGeminiJson(responseData);
  const parsed = weeklyFarmBriefingSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Gemini weekly farm briefing JSON schema mismatch.");
  }

  return parsed.data;
}

function includesTargetTerm(briefing: Pick<
  WeeklyFarmBriefing,
  | "headline"
  | "summaryBullets"
  | "actionBullets"
  | "cautionBullets"
  | "weatherBullets"
  | "pestRiskBullets"
  | "irrigationBullets"
  | "growthManagementBullets"
  | "evidenceSnippets"
>, terms: string[]): boolean {
  const haystack = [
    briefing.headline,
    ...briefing.summaryBullets,
    ...briefing.actionBullets,
    ...briefing.cautionBullets,
    ...briefing.weatherBullets,
    ...briefing.pestRiskBullets,
    ...briefing.irrigationBullets,
    ...briefing.growthManagementBullets,
    ...briefing.evidenceSnippets,
  ].join("\n");

  return terms.some((term) => haystack.includes(term));
}

function enforceTargetCropRelevance(
  briefing: ReturnType<typeof parseWeeklyFarmBriefingFromGeminiResponse>,
  cropName: string,
  cropGroup: string | null,
): ReturnType<typeof parseWeeklyFarmBriefingFromGeminiResponse> {
  if (!briefing.relevant) return briefing;

  const terms = [cropName, cropGroup].filter((term): term is string => Boolean(term?.trim()));
  if (terms.length === 0 || includesTargetTerm(briefing, terms)) return briefing;

  return {
    relevant: false,
    headline: `${cropName} 관련 주간농사정보 없음`,
    summaryBullets: [],
    actionBullets: [],
    cautionBullets: ["원문 PDF에서 선택 작물 또는 작물군과 직접 연결되는 문구를 확인하지 못했습니다."],
    weatherBullets: [],
    pestRiskBullets: [],
    irrigationBullets: [],
    growthManagementBullets: [],
    evidenceSnippets: [],
  };
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cacheKeyPart(value: string | null | undefined): string {
  return encodeURIComponent(value?.trim() || "-");
}

function getWeeklyBriefingCacheKey(
  cropName: string,
  cropGroup: string | null,
  sourceUrl: string,
  publishedAt: string | null,
  contextKey: string,
): string {
  return [
    WEEKLY_BRIEFING_CACHE_PREFIX,
    cacheKeyPart(cropName),
    cacheKeyPart(cropGroup),
    cacheKeyPart(sourceUrl),
    cacheKeyPart(publishedAt),
    cacheKeyPart(contextKey),
  ].join(":");
}

function getExplicitContextKey(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const contextKey = (value as { contextKey?: unknown }).contextKey;
  return typeof contextKey === "string" && contextKey.trim() ? contextKey : null;
}

function withCacheMetadata(
  briefing: z.infer<typeof weeklyFarmBriefingCacheSchema>,
  cacheStatus: Extract<WeeklyFarmBriefingCacheStatus, "cached" | "stale">,
  errorCode?: string,
): WeeklyFarmBriefing {
  return {
    ...briefing,
    baseBriefingKey: briefing.baseBriefingKey ?? briefing.contextKey,
    weatherIncident: briefing.weatherIncident ?? null,
    cacheStatus,
    ...(errorCode ? { errorCode } : {}),
  };
}

function readCachedBriefing(
  cacheKey: string,
  cacheStatus: Extract<WeeklyFarmBriefingCacheStatus, "cached" | "stale"> = "cached",
  errorCode?: string,
  expectedContextKey?: string | null,
): WeeklyFarmBriefing | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(cacheKey);
    if (!raw) return null;
    const rawValue = JSON.parse(raw);
    const explicitContextKey = getExplicitContextKey(rawValue);
    const parsed = weeklyFarmBriefingCacheSchema.safeParse(rawValue);
    if (!parsed.success) {
      storage.removeItem(cacheKey);
      return null;
    }
    if (expectedContextKey && explicitContextKey && explicitContextKey !== expectedContextKey) return null;

    return withCacheMetadata(parsed.data, cacheStatus, errorCode);
  } catch {
    return null;
  }
}

function parsePersistedBriefing(
  value: Json | null | undefined,
  cacheStatus: Extract<WeeklyFarmBriefingCacheStatus, "cached" | "stale"> = "cached",
  errorCode?: string,
  expectedContextKey?: string | null,
): WeeklyFarmBriefing | null {
  const explicitContextKey = getExplicitContextKey(value);
  const parsed = weeklyFarmBriefingCacheSchema.safeParse(value);
  if (!parsed.success) return null;
  if (expectedContextKey && explicitContextKey && explicitContextKey !== expectedContextKey) return null;

  return withCacheMetadata(parsed.data, cacheStatus, errorCode);
}

async function readPersistedBriefing(
  weeklyInfo: NongsaroWeeklyInfo,
  cacheStatus: Extract<WeeklyFarmBriefingCacheStatus, "cached" | "stale"> = "cached",
  errorCode?: string,
  expectedContextKey?: string | null,
): Promise<WeeklyFarmBriefing | null> {
  if (weeklyInfo.summaryStatus === "ready") {
    const inline = parsePersistedBriefing(weeklyInfo.summaryPayload, cacheStatus, errorCode, expectedContextKey);
    if (inline) return inline;
  }

  if (!weeklyInfo.sourceKey) return null;

  const { data, error } = await supabase
    .from("weekly_farm_infos")
    .select("summary_status,summary_payload")
    .eq("source_key", weeklyInfo.sourceKey)
    .maybeSingle();

  if (error) {
    if (isWeeklyFarmInfoPersistenceMissing(error)) return null;
    throw error;
  }
  if (data?.summary_status !== "ready") return null;
  return parsePersistedBriefing(data.summary_payload, cacheStatus, errorCode, expectedContextKey);
}

function writeCachedBriefing(cacheKey: string, briefing: WeeklyFarmBriefing): void {
  const storage = getStorage();
  if (!storage || briefing.cacheStatus !== "fresh") return;

  try {
    const { cacheStatus: _cacheStatus, errorCode: _errorCode, ...payload } = briefing;
    storage.setItem(cacheKey, JSON.stringify(payload));
  } catch {
    // Local storage can be unavailable or full; the live briefing is still usable.
  }
}

function buildSummaryText(briefing: WeeklyFarmBriefing): string {
  const sections = [
    briefing.headline,
    ...briefing.summaryBullets.map((item) => `핵심 요약: ${item}`),
    ...briefing.weatherBullets.map((item) => `기상 반영: ${item}`),
    ...briefing.pestRiskBullets.map((item) => `병해충 가능성: ${item}`),
    ...briefing.irrigationBullets.map((item) => `관수 판단: ${item}`),
    ...briefing.growthManagementBullets.map((item) => `생육 관리: ${item}`),
    ...briefing.actionBullets.map((item) => `확인할 일: ${item}`),
    ...briefing.cautionBullets.map((item) => `주의사항: ${item}`),
  ];
  return sections.filter((item) => item.trim()).join("\n");
}

function toPersistedPayload(briefing: WeeklyFarmBriefing): Json {
  const { cacheStatus: _cacheStatus, errorCode: _errorCode, ...payload } = briefing;
  return payload as unknown as Json;
}

async function updateWeeklyFarmInfoSummary(
  weeklyInfo: NongsaroWeeklyInfo,
  payload: TablesUpdate<"weekly_farm_infos">,
): Promise<void> {
  if (!weeklyInfo.sourceKey) return;
  const { error } = await supabase
    .from("weekly_farm_infos")
    .update(payload)
    .eq("source_key", weeklyInfo.sourceKey);

  if (isWeeklyFarmInfoPersistenceMissing(error)) return;
  if (error) throw error;
}

async function writePersistedBriefing(
  weeklyInfo: NongsaroWeeklyInfo,
  briefing: WeeklyFarmBriefing,
): Promise<void> {
  await updateWeeklyFarmInfoSummary(weeklyInfo, {
    summary_status: "ready",
    summary_text: buildSummaryText(briefing),
    summary_payload: toPersistedPayload(briefing),
    summary_model: briefing.model,
    summary_fetched_at: briefing.fetchedAt,
  });
}

async function markPersistedBriefingFailed(
  weeklyInfo: NongsaroWeeklyInfo,
  fetchedAt = new Date().toISOString(),
): Promise<void> {
  try {
    await updateWeeklyFarmInfoSummary(weeklyInfo, {
      summary_status: "failed",
      summary_model: WEEKLY_BRIEFING_MODEL,
      summary_fetched_at: fetchedAt,
    });
  } catch {
    // The unavailable briefing still tells the user to open the source PDF.
  }
}

function getErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) return code;
  }
  return "unknown_error";
}

function buildUnavailableBriefing(input: {
  cropName: string;
  cropGroup: string | null;
  fieldContext: WeeklyFarmBriefingFieldContext | null;
  weatherContext: WeeklyFarmBriefingWeatherContext | null;
  contextKey: string;
  baseBriefingKey: string;
  weatherIncidentKey: string;
  weatherIncident: CriticalWeatherIncident | null;
  weeklyInfo: NongsaroWeeklyInfo;
  sourceUrl: string;
  errorCode: string;
}): WeeklyFarmBriefing {
  return {
    relevant: true,
    headline: `${input.cropName} 주간농사정보 AI 요약 지연`,
    summaryBullets: ["PDF 요약 요청이 제한 시간 안에 완료되지 않았습니다."],
    actionBullets: [],
    cautionBullets: ["원문 PDF를 직접 확인해 최신 주간농사정보를 확인하세요."],
    weatherBullets: [],
    pestRiskBullets: [],
    irrigationBullets: [],
    growthManagementBullets: [],
    evidenceSnippets: [],
    cropName: input.cropName,
    cropGroup: input.cropGroup,
    fieldContext: input.fieldContext,
    weatherContext: input.weatherContext,
    contextKey: input.contextKey,
    baseBriefingKey: input.baseBriefingKey,
    weatherIncidentKey: input.weatherIncidentKey,
    weatherIncident: input.weatherIncident,
    sourceTitle: input.weeklyInfo.title,
    sourceUrl: input.sourceUrl,
    publishedAt: input.weeklyInfo.publishedAt,
    model: WEEKLY_BRIEFING_MODEL,
    fetchedAt: new Date().toISOString(),
    cacheStatus: "unavailable",
    errorCode: input.errorCode,
  };
}

const prependUnique = (priorityItems: string[], baseItems: string[]): string[] => {
  const items: string[] = [];
  for (const item of [...priorityItems, ...baseItems]) {
    const trimmed = item.trim();
    if (trimmed && !items.includes(trimmed)) items.push(trimmed);
  }
  return items.slice(0, 5);
};

function withRuntimeContextAndIncident(
  baseBriefing: WeeklyFarmBriefing,
  input: {
    fieldContext: WeeklyFarmBriefingFieldContext | null;
    weatherContext: WeeklyFarmBriefingWeatherContext | null;
    baseBriefingKey: string;
    weatherIncident: CriticalWeatherIncident | null;
    contextKey: string;
  },
): WeeklyFarmBriefing {
  const weatherIncidentKey = input.weatherIncident?.key ?? "normal";
  if (!input.weatherIncident) {
    return {
      ...baseBriefing,
      fieldContext: input.fieldContext,
      weatherContext: input.weatherContext,
      baseBriefingKey: input.baseBriefingKey,
      weatherIncidentKey,
      weatherIncident: null,
      contextKey: input.contextKey,
    };
  }

  return {
    ...baseBriefing,
    fieldContext: input.fieldContext,
    weatherContext: input.weatherContext,
    baseBriefingKey: input.baseBriefingKey,
    weatherIncidentKey,
    weatherIncident: input.weatherIncident,
    contextKey: input.contextKey,
    weatherBullets: prependUnique(input.weatherIncident.weatherBullets, baseBriefing.weatherBullets),
    pestRiskBullets: prependUnique(input.weatherIncident.pestRiskBullets, baseBriefing.pestRiskBullets),
    irrigationBullets: prependUnique(input.weatherIncident.irrigationBullets, baseBriefing.irrigationBullets),
    growthManagementBullets: prependUnique(
      input.weatherIncident.growthManagementBullets,
      baseBriefing.growthManagementBullets,
    ),
    actionBullets: prependUnique(input.weatherIncident.actionBullets, baseBriefing.actionBullets),
    cautionBullets: prependUnique(input.weatherIncident.cautionBullets, baseBriefing.cautionBullets),
  };
}

export async function getWeeklyFarmBriefing(input: GetWeeklyFarmBriefingInput): Promise<WeeklyFarmBriefing | null> {
  const cropName = input.cropName.trim();
  const sourceUrl = getWeeklyFarmBriefingPdfSourceUrl(input.weeklyInfo);
  const fallbackSourceUrl = getWeeklyFarmBriefingFallbackSourceUrl(input.weeklyInfo);
  const cacheSourceUrl = sourceUrl ?? fallbackSourceUrl;
  if (!cropName || !cacheSourceUrl) return null;

  const profile = getNongsaroCropSearchProfile(cropName);
  const cropGroup = profile.weeklyKeywords.find((keyword) => keyword !== profile.canonicalName) ?? null;
  const normalizedCropName = profile.canonicalName || cropName;
  const fieldContext = normalizeFieldContext(input.field);
  const weatherContext = normalizeWeatherContext(input.weather);
  const baseBriefingKey = buildBaseBriefingKey(input.weeklyInfo, normalizedCropName);
  const weatherIncident = detectCriticalWeatherIncident(weatherContext);
  const weatherIncidentKey = weatherIncident?.key ?? "normal";
  const baseContextKey = buildContextKey(baseBriefingKey, "normal");
  const contextKey = buildContextKey(baseBriefingKey, weatherIncidentKey);
  const cacheKey = getWeeklyBriefingCacheKey(
    normalizedCropName,
    cropGroup,
    cacheSourceUrl,
    input.weeklyInfo.publishedAt,
    baseContextKey,
  );
  if (!input.forceRefresh) {
    const persistedBriefing = await readPersistedBriefing(
      input.weeklyInfo,
      "cached",
      undefined,
      baseContextKey,
    );
    if (persistedBriefing) {
      return withRuntimeContextAndIncident(persistedBriefing, {
        fieldContext,
        weatherContext,
        baseBriefingKey,
        weatherIncident,
        contextKey,
      });
    }

    const cachedBriefing = readCachedBriefing(cacheKey, "cached", undefined, baseContextKey);
    if (cachedBriefing) {
      return withRuntimeContextAndIncident(cachedBriefing, {
        fieldContext,
        weatherContext,
        baseBriefingKey,
        weatherIncident,
        contextKey,
      });
    }
  }

  if (!sourceUrl) {
    return buildUnavailableBriefing({
      cropName: normalizedCropName,
      cropGroup,
      fieldContext,
      weatherContext,
      contextKey,
      baseBriefingKey,
      weatherIncidentKey,
      weatherIncident,
      weeklyInfo: input.weeklyInfo,
      sourceUrl: cacheSourceUrl,
      errorCode: "unsupported_weekly_document",
    });
  }

  let response: WeeklyFarmBriefingProxyResponse;
  try {
    response = await invokeApiAdapter<WeeklyFarmBriefingProxyResponse, WeeklyFarmBriefingProxyRequest>(
      "gemini",
      "weekly-farm-briefing-proxy",
      {
        sourceUrl,
        sourceTitle: input.weeklyInfo.title,
        publishedAt: input.weeklyInfo.publishedAt,
        cropName: normalizedCropName,
        cropGroup,
        field: null,
        weather: null,
        model: WEEKLY_BRIEFING_MODEL,
      },
      { signal: input.signal, timeout: WEEKLY_BRIEFING_CLIENT_TIMEOUT_MS },
    );
  } catch (error) {
    if (input.signal?.aborted) throw error;
    const errorCode = getErrorCode(error);
    const persistedStale = await readPersistedBriefing(input.weeklyInfo, "stale", errorCode, baseContextKey);
    if (persistedStale) {
      return withRuntimeContextAndIncident(persistedStale, {
        fieldContext,
        weatherContext,
        baseBriefingKey,
        weatherIncident,
        contextKey,
      });
    }

    await markPersistedBriefingFailed(input.weeklyInfo);
    const cachedStale = readCachedBriefing(cacheKey, "stale", errorCode, baseContextKey);
    if (cachedStale) {
      return withRuntimeContextAndIncident(cachedStale, {
        fieldContext,
        weatherContext,
        baseBriefingKey,
        weatherIncident,
        contextKey,
      });
    }
    return buildUnavailableBriefing({
      cropName: normalizedCropName,
      cropGroup,
      fieldContext,
      weatherContext,
      contextKey,
      baseBriefingKey,
      weatherIncidentKey,
      weatherIncident,
      weeklyInfo: input.weeklyInfo,
      sourceUrl,
      errorCode,
    });
  }

  if (response.status === "degraded") {
    const errorCode = response.errorCode ?? "weekly_briefing_degraded";
    const persistedStale = await readPersistedBriefing(input.weeklyInfo, "stale", errorCode, baseContextKey);
    if (persistedStale) {
      return withRuntimeContextAndIncident(persistedStale, {
        fieldContext,
        weatherContext,
        baseBriefingKey,
        weatherIncident,
        contextKey,
      });
    }

    await markPersistedBriefingFailed(input.weeklyInfo, response.fetchedAt);
    const cachedStale = readCachedBriefing(cacheKey, "stale", errorCode, baseContextKey);
    if (cachedStale) {
      return withRuntimeContextAndIncident(cachedStale, {
        fieldContext,
        weatherContext,
        baseBriefingKey,
        weatherIncident,
        contextKey,
      });
    }
    return buildUnavailableBriefing({
      cropName: normalizedCropName,
      cropGroup,
      fieldContext,
      weatherContext,
      contextKey,
      baseBriefingKey,
      weatherIncidentKey,
      weatherIncident,
      weeklyInfo: input.weeklyInfo,
      sourceUrl,
      errorCode,
    });
  }

  const briefing = enforceTargetCropRelevance(
    parseWeeklyFarmBriefingFromGeminiResponse(response.data),
    normalizedCropName,
    cropGroup,
  );

  const result: WeeklyFarmBriefing = {
    ...briefing,
    cropName: normalizedCropName,
    cropGroup,
    fieldContext: null,
    weatherContext: null,
    contextKey: baseContextKey,
    baseBriefingKey,
    weatherIncidentKey: "normal",
    weatherIncident: null,
    sourceTitle: response.sourceTitle ?? input.weeklyInfo.title,
    sourceUrl: response.sourceUrl || sourceUrl,
    publishedAt: response.publishedAt ?? input.weeklyInfo.publishedAt,
    model: response.model,
    fetchedAt: response.fetchedAt,
    cacheStatus: "fresh",
  };

  await writePersistedBriefing(input.weeklyInfo, result);
  writeCachedBriefing(cacheKey, result);
  return withRuntimeContextAndIncident(result, {
    fieldContext,
    weatherContext,
    baseBriefingKey,
    weatherIncident,
    contextKey,
  });
}
