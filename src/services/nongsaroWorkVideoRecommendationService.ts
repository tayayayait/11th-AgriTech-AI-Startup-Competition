import { z } from "zod";
import { normalizeNongsaroUrl } from "@/domain/nongsaro/common";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import {
  getCropEbookVideosForCrop,
  type CropEbookVideo,
  type CropEbookVideoLookup,
} from "@/services/cropEbookService";
import { analyzeWithGemini } from "@/services/geminiClient";

type WorkVideoRecommendationRow = Tables<"nongsaro_work_video_recommendations"> & {
  work_item_period?: string | null;
};
type WorkVideoRecommendationInsert = TablesInsert<"nongsaro_work_video_recommendations"> & {
  work_item_period?: string | null;
};

export type WorkVideoMatchType = "direct" | "reference" | "low" | "exclude";

export interface GetWorkVideoRecommendationsForEraInput {
  fieldId: string;
  cropName: string;
  scheduleSourceId: string;
  workItem: string;
  infoType: string | null;
  periodLabel: string;
  scheduleMonth: number;
  farmWorkFlag: string | null;
  forceRefresh?: boolean;
  signal?: AbortSignal;
}

export interface WorkVideoRecommendation {
  cropName: string;
  workItem: string;
  workItemTitle: string;
  workItemPeriod: string | null;
  videoTitle: string;
  videoOriginInstt: string | null;
  videoLink: string;
  videoImg: string | null;
  matchScore: number;
  matchType: WorkVideoMatchType;
  reason: string;
  sourceApi: string;
  judgedBy: string;
  fetchedAt: string;
}

const SOURCE_API = "nongsaro.cropEbook.videoList";
const JUDGED_BY = "gemini";
const WORK_VIDEO_MODEL = "gemini-3-flash-preview";
const VISIBLE_SCORE_THRESHOLD = 70;
const MATCH_TYPES = new Set<WorkVideoMatchType>(["direct", "reference", "low", "exclude"]);
const cropVideoLookupCache = new Map<string, Promise<CropEbookVideoLookup>>();

const judgementSchema = z.object({
  videoLink: z.string().trim().min(1),
  matchType: z.enum(["direct", "reference", "low", "exclude"]),
  matchScore: z.number().int().min(0).max(100),
  reason: z.string().trim().min(1).max(240),
});

const judgementResponseSchema = z.object({
  recommendations: z.array(judgementSchema).max(60),
});

export type WorkVideoJudgement = z.infer<typeof judgementSchema>;

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
    throw new Error("Gemini work video judgement JSON parse failed.");
  }
}

function extractGeminiJson(responseData: unknown): unknown {
  if (!responseData || typeof responseData !== "object") {
    throw new Error("Gemini work video judgement response is empty.");
  }

  const source = responseData as Record<string, unknown>;
  if ("recommendations" in source) return source;

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

  throw new Error("Gemini work video judgement JSON was not found.");
}

export function parseWorkVideoJudgementFromGeminiResponse(responseData: unknown): WorkVideoJudgement[] {
  const payload = extractGeminiJson(responseData);
  const parsed = judgementResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Gemini work video judgement JSON schema mismatch.");
  }
  return parsed.data.recommendations;
}

export function filterVisibleWorkVideoRecommendations<T extends Pick<WorkVideoRecommendation, "matchScore" | "matchType">>(
  recommendations: T[],
): T[] {
  return recommendations
    .filter((item) =>
      (item.matchType === "direct" || item.matchType === "reference") &&
      item.matchScore >= VISIBLE_SCORE_THRESHOLD,
    )
    .sort((a, b) => b.matchScore - a.matchScore);
}

export function buildWorkVideoRecommendationKey(input: GetWorkVideoRecommendationsForEraInput): string {
  return [
    input.cropName.trim(),
    `month:${input.scheduleMonth}`,
    input.scheduleSourceId.trim(),
    input.workItem.trim(),
    input.infoType?.trim() ?? "",
    input.periodLabel.trim(),
    input.farmWorkFlag?.trim() ?? "",
  ].join("|");
}

function buildLegacyWorkVideoRecommendationKey(input: GetWorkVideoRecommendationsForEraInput): string {
  return [
    input.cropName.trim(),
    input.scheduleSourceId.trim(),
    input.workItem.trim(),
    input.infoType?.trim() ?? "",
    input.periodLabel.trim(),
    input.farmWorkFlag?.trim() ?? "",
  ].join("|");
}

function getKstMonthFromIso(value: string): number | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
  }).format(date);
  const parsed = Number(month);
  return Number.isInteger(parsed) ? parsed : null;
}

function hasRecommendationFetchedInScheduleMonth(
  recommendations: WorkVideoRecommendation[],
  scheduleMonth: number,
): boolean {
  return recommendations.some((item) => getKstMonthFromIso(item.fetchedAt) === scheduleMonth);
}

function normalizeMatchType(value: string): WorkVideoMatchType {
  return MATCH_TYPES.has(value as WorkVideoMatchType) ? (value as WorkVideoMatchType) : "exclude";
}

function rowToRecommendation(row: WorkVideoRecommendationRow): WorkVideoRecommendation {
  return {
    cropName: row.crop_name,
    workItem: row.work_item,
    workItemTitle: row.work_item,
    workItemPeriod: row.work_item_period ?? null,
    videoTitle: row.video_title,
    videoOriginInstt: row.video_origin_instt,
    videoLink: row.video_link,
    videoImg: normalizeNongsaroUrl(row.video_img),
    matchScore: row.match_score,
    matchType: normalizeMatchType(row.match_type),
    reason: row.reason,
    sourceApi: row.source_api,
    judgedBy: row.judged_by,
    fetchedAt: row.fetched_at,
  };
}

function getJudgementJsonSchema(): Record<string, unknown> {
  return {
    type: "OBJECT",
    properties: {
      recommendations: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            videoLink: { type: "STRING" },
            matchType: { type: "STRING", enum: ["direct", "reference", "low", "exclude"] },
            matchScore: { type: "INTEGER" },
            reason: { type: "STRING" },
          },
          required: ["videoLink", "matchType", "matchScore", "reason"],
          propertyOrdering: ["videoLink", "matchType", "matchScore", "reason"],
        },
      },
    },
    required: ["recommendations"],
    propertyOrdering: ["recommendations"],
  };
}

function buildJudgementPrompt(input: GetWorkVideoRecommendationsForEraInput, videos: CropEbookVideo[]): string {
  return [
    "농사로 cropEbook.videoList 동영상 후보와 현재 농작업일정 작업 항목의 관련성을 판정하세요.",
    "후보 목록에 있는 각 videoLink에 대해서만 판단하고, 후보 밖의 링크나 제목은 만들지 마세요.",
    "작업명과 동영상 제목이 직접 일치하거나 강하게 관련되면 direct로 분류하고 90~100점을 부여하세요.",
    "작목은 같고 해당 작업을 이해하거나 실행하는 데 도움이 되면 reference로 분류하고 70~89점을 부여하세요.",
    "작목만 같고 작업 관련성이 낮거나 무관하면 exclude로 분류하고 0~69점을 부여하세요.",
    "판정 사유는 한국어 한 문장으로 짧게 작성하세요.",
    "반드시 JSON 객체만 반환하세요. markdown, 코드블록, 설명문은 금지합니다.",
    `작목명: ${input.cropName}`,
    `작업명: ${input.workItem}`,
    `작업 분류: ${input.infoType ?? "없음"}`,
    `작업 시기: ${input.periodLabel || "없음"}`,
    `화면 기준 월: ${input.scheduleMonth}월`,
    `작업 보조분류: ${input.farmWorkFlag ?? "없음"}`,
    "동영상 후보:",
    JSON.stringify(
      videos.map((video) => ({
        videoTitle: video.videoTitle,
        videoOriginInstt: video.videoOriginInstt,
        videoLink: video.videoLink,
      })),
      null,
      2,
    ),
  ].join("\n");
}

async function judgeVideosWithGemini(
  input: GetWorkVideoRecommendationsForEraInput,
  videos: CropEbookVideo[],
): Promise<{ judgements: WorkVideoJudgement[]; fetchedAt: string }> {
  const response = await analyzeWithGemini(
    {
      model: WORK_VIDEO_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: buildJudgementPrompt(input, videos) }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: getJudgementJsonSchema(),
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 12000,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    },
    { signal: input.signal, timeout: 25000 },
  );

  return {
    judgements: parseWorkVideoJudgementFromGeminiResponse(response.data),
    fetchedAt: response.fetchedAt,
  };
}

function buildRows(input: {
  request: GetWorkVideoRecommendationsForEraInput;
  workItemKey: string;
  subCategoryCode: string | null;
  videos: CropEbookVideo[];
  judgements: WorkVideoJudgement[];
  fetchedAt: string;
}): WorkVideoRecommendationInsert[] {
  const judgementsByLink = new Map(input.judgements.map((item) => [item.videoLink, item]));
  return input.videos.map((video) => {
    const judgement = judgementsByLink.get(video.videoLink) ?? {
      videoLink: video.videoLink,
      matchType: "exclude" as const,
      matchScore: 0,
      reason: "Gemini 판정 결과에 포함되지 않아 제외했습니다.",
    };

    return {
      field_id: input.request.fieldId,
      crop_name: input.request.cropName,
      sub_category_code: input.subCategoryCode,
      work_item_key: input.workItemKey,
      schedule_source_id: input.request.scheduleSourceId,
      work_item: input.request.workItem,
      work_item_period: input.request.periodLabel || null,
      video_title: video.videoTitle,
      video_origin_instt: video.videoOriginInstt,
      video_link: video.videoLink,
      video_img: video.videoImg,
      match_score: judgement.matchScore,
      match_type: judgement.matchType,
      reason: judgement.reason,
      source_api: SOURCE_API,
      judged_by: JUDGED_BY,
      fetched_at: input.fetchedAt,
    };
  });
}

async function readPersistedRecommendations(
  fieldId: string,
  workItemKey: string,
): Promise<WorkVideoRecommendation[] | null> {
  const { data, error } = await supabase
    .from("nongsaro_work_video_recommendations")
    .select("*")
    .eq("field_id", fieldId)
    .eq("work_item_key", workItemKey)
    .order("match_score", { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data.map(rowToRecommendation);
}

async function deletePersistedRecommendations(fieldId: string, workItemKey: string): Promise<void> {
  const { error } = await supabase
    .from("nongsaro_work_video_recommendations")
    .delete()
    .eq("field_id", fieldId)
    .eq("work_item_key", workItemKey);

  if (error) throw error;
}

async function saveRecommendations(rows: WorkVideoRecommendationInsert[]): Promise<WorkVideoRecommendation[]> {
  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from("nongsaro_work_video_recommendations")
    .upsert(rows, { onConflict: "field_id,work_item_key,video_link" })
    .select("*")
    .order("match_score", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToRecommendation);
}

function getCropVideoLookupCacheKey(cropName: string): string {
  return cropName.trim().toLowerCase();
}

export function clearWorkVideoRecommendationRuntimeCache(): void {
  cropVideoLookupCache.clear();
}

function getCachedCropVideoLookup(cropName: string, forceRefresh: boolean): Promise<CropEbookVideoLookup> {
  const key = getCropVideoLookupCacheKey(cropName);
  if (!forceRefresh) {
    const cached = cropVideoLookupCache.get(key);
    if (cached) return cached;
  }

  const lookupPromise = getCropEbookVideosForCrop(cropName, { numOfRows: 20, maxPages: 3 })
    .finally(() => {
      cropVideoLookupCache.delete(key);
    });
  cropVideoLookupCache.set(key, lookupPromise);
  return lookupPromise;
}

export async function getWorkVideoRecommendationsForEra(
  input: GetWorkVideoRecommendationsForEraInput,
): Promise<WorkVideoRecommendation[]> {
  const workItemKey = buildWorkVideoRecommendationKey(input);

  if (!input.forceRefresh) {
    const persisted = await readPersistedRecommendations(input.fieldId, workItemKey);
    if (persisted) return persisted;

    const legacyWorkItemKey = buildLegacyWorkVideoRecommendationKey(input);
    const legacyPersisted = await readPersistedRecommendations(input.fieldId, legacyWorkItemKey);
    if (legacyPersisted && hasRecommendationFetchedInScheduleMonth(legacyPersisted, input.scheduleMonth)) {
      return legacyPersisted;
    }
  }

  const lookup = await getCachedCropVideoLookup(input.cropName, Boolean(input.forceRefresh));
  if (lookup.videos.length === 0) {
    if (input.forceRefresh) {
      await deletePersistedRecommendations(input.fieldId, workItemKey);
    }
    return [];
  }

  const { judgements, fetchedAt } = await judgeVideosWithGemini(input, lookup.videos);
  const candidateLinks = new Set(lookup.videos.map((video) => video.videoLink));
  const validJudgements = judgements.filter((judgement) => candidateLinks.has(judgement.videoLink));
  const rows = buildRows({
    request: input,
    workItemKey,
    subCategoryCode: lookup.subCategoryCode,
    videos: lookup.videos,
    judgements: validJudgements,
    fetchedAt,
  });

  if (input.forceRefresh) {
    await deletePersistedRecommendations(input.fieldId, workItemKey);
  }

  return saveRecommendations(rows);
}
