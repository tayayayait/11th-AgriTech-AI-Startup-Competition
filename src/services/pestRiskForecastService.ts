import {
  buildPestRiskForecast,
  getDisasterSearchKeywordsForWeather,
  type PestRiskForecast,
  type PestRiskOfficialSource,
} from "@/domain/pest/pestRiskForecast";
import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import type { KmaWeatherSnapshot } from "@/domain/weather/kma";
import { scoreToLevel } from "@/domain/risk/risk";
import { buildPestRiskTimelineItem } from "@/domain/timeline/timelineItems";
import { getDisasterPreventionSources } from "@/services/nongsaroDisasterService";
import { getNpmsPestCandidateSources } from "@/services/npmsPestService";
import { tryCreateTimelineItem } from "@/services/timelineService";

export interface GeneratePestRiskForecastInput {
  fieldId: string;
  cropName: string;
  weather: KmaWeatherSnapshot;
  weatherRiskScore?: number | null;
}

export interface SavedPestRiskForecast extends PestRiskForecast {
  id: string;
  field_id: string;
  crop_name: string;
  candidate_name: string;
  official_sources: string[];
  created_at: string;
}

interface ExistingPestRiskRow {
  id: string;
  field_id: string;
  crop_name: string;
  candidate_name: string;
  score: number;
  reasons: Json;
  official_sources: Json;
  created_at: string;
}

const PEST_FORECAST_REUSE_WINDOW_MS = 30 * 60 * 1000;

const toDisasterOfficialSource = (source: {
  title: string;
  attachmentPath: string | null;
}): PestRiskOfficialSource => ({
  type: "disaster",
  title: source.title,
  url: source.attachmentPath,
});

const dedupeOfficialSources = (sources: PestRiskOfficialSource[]): PestRiskOfficialSource[] => {
  const deduped = new Map<string, PestRiskOfficialSource>();
  for (const source of sources) {
    const key = `${source.type}:${source.title}:${source.url ?? ""}`;
    if (!deduped.has(key)) deduped.set(key, source);
  }
  return Array.from(deduped.values());
};

const toStringArray = (value: Json): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
};

const isRecentForecast = (createdAt: string): boolean => {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= PEST_FORECAST_REUSE_WINDOW_MS;
};

const toSavedForecast = (row: ExistingPestRiskRow): SavedPestRiskForecast => {
  const reasons = toStringArray(row.reasons);
  const officialSources = toStringArray(row.official_sources);

  return {
    id: row.id,
    field_id: row.field_id,
    crop_name: row.crop_name,
    candidate_name: row.candidate_name,
    candidateName: row.candidate_name,
    score: row.score,
    level: scoreToLevel(row.score),
    reasons,
    officialSources,
    official_sources: officialSources,
    created_at: row.created_at,
  };
};

const findReusableForecast = async (
  fieldId: string,
  candidateName: string,
  score: number,
): Promise<SavedPestRiskForecast | null> => {
  const { data, error } = await supabase
    .from("pest_risks")
    .select("id,field_id,crop_name,candidate_name,score,reasons,official_sources,created_at")
    .eq("field_id", fieldId)
    .eq("candidate_name", candidateName)
    .eq("score", score)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.created_at || !isRecentForecast(data.created_at)) return null;
  return toSavedForecast(data as ExistingPestRiskRow);
};

const collectOfficialSources = async (
  cropName: string,
  weather: KmaWeatherSnapshot,
): Promise<PestRiskOfficialSource[]> => {
  const officialSources = await getNpmsPestCandidateSources(cropName);
  const disasterKeywords = getDisasterSearchKeywordsForWeather(weather);

  for (const keyword of disasterKeywords) {
    try {
      const disasterSources = await getDisasterPreventionSources(keyword);
      officialSources.push(...disasterSources.map(toDisasterOfficialSource));
    } catch {
      // 재해예방 자료 조회 실패는 병해충 위험 예보 자체를 막지 않는다.
    }
  }

  return dedupeOfficialSources(officialSources).slice(0, 8);
};

const updateFieldRisk = async (
  fieldId: string,
  score: number,
  riskLevel: SavedPestRiskForecast["level"],
): Promise<void> => {
  const { error } = await supabase
    .from("fields")
    .update({
      risk_score: score,
      risk_level: riskLevel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fieldId);

  if (error) throw error;
};

export const generateAndSavePestRiskForecast = async (
  input: GeneratePestRiskForecastInput,
): Promise<SavedPestRiskForecast[]> => {
  const officialSources = await collectOfficialSources(input.cropName, input.weather);
  const forecast = buildPestRiskForecast({
    cropName: input.cropName,
    weather: input.weather,
    weatherRiskScore: input.weatherRiskScore,
    officialSources,
  });

  const reusable = await findReusableForecast(input.fieldId, forecast.candidateName, forecast.score);
  if (reusable) return [reusable];

  const payload: TablesInsert<"pest_risks"> = {
    field_id: input.fieldId,
    crop_name: input.cropName,
    candidate_name: forecast.candidateName,
    score: forecast.score,
    reasons: forecast.reasons as Json,
    official_sources: forecast.officialSources as Json,
  };

  const query = supabase.from("pest_risks");
  const { error: deleteError } = await query
    .delete()
    .eq("field_id", input.fieldId)
    .eq("candidate_name", forecast.candidateName);
  if (deleteError) throw deleteError;

  const { data, error: insertError } = await supabase
    .from("pest_risks")
    .insert(payload)
    .select("id,created_at")
    .single();
  if (insertError) throw insertError;

  const createdAt = typeof data.created_at === "string" ? data.created_at : new Date().toISOString();
  await tryCreateTimelineItem(buildPestRiskTimelineItem({
    fieldId: input.fieldId,
    pestRiskId: data.id,
    candidateName: forecast.candidateName,
    score: forecast.score,
    reasons: forecast.reasons,
    createdAt,
  }));

  if (forecast.score > 0) {
    await updateFieldRisk(input.fieldId, forecast.score, forecast.level);
  }

  return [
    {
      ...forecast,
      id: data.id,
      field_id: input.fieldId,
      crop_name: input.cropName,
      candidate_name: forecast.candidateName,
      official_sources: forecast.officialSources,
      created_at: createdAt,
    },
  ];
};
