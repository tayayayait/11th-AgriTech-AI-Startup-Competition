import {
  resolveKmaBaseDateTime,
  summarizeKmaWeather,
  toKmaGrid,
  type KmaWeatherSnapshot,
} from "@/domain/weather/kma";
import { assessWeatherRisk, type WeatherRiskFactor } from "@/domain/weather/weatherRisk";
import type { RiskLevel } from "@/domain/risk/risk";
import { buildWeatherRiskTimelineItem } from "@/domain/timeline/timelineItems";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { ApiAdapterError } from "@/services/api/errors";
import { fetchKma } from "@/services/kmaClient";
import { tryCreateTimelineItem } from "@/services/timelineService";

export type SourceStatus = "connected" | "delayed" | "unavailable" | "rate_limited";

export interface LiveWeatherResult extends KmaWeatherSnapshot {
  sourceStatus: SourceStatus;
  collectedAt: string;
  summary: string;
  riskScore: number | null;
  riskLevel: RiskLevel;
  riskFactors: WeatherRiskFactor[];
}

function mapSourceStatusFromError(error: unknown): SourceStatus {
  if (error instanceof ApiAdapterError) {
    if (error.code === "edge_fetch_error" || error.code === "edge_relay_error") return "delayed";
    if (error.message.toLowerCase().includes("quota")) return "rate_limited";
  }

  if (!(error instanceof Error)) return "unavailable";

  const message = error.message.toLowerCase();
  if (message.includes("rate") || message.includes("limit") || message.includes("quota")) return "rate_limited";
  if (message.includes("timeout") || message.includes("지연")) return "delayed";
  return "unavailable";
}

async function persistWeatherRisk(
  fieldId: string | undefined,
  snapshot: KmaWeatherSnapshot,
  sourceStatus: SourceStatus,
  summary: string,
  collectedAt: string,
  riskScore: number | null,
  riskLevel: RiskLevel,
): Promise<void> {
  if (!fieldId) return;

  const weatherRisk: TablesInsert<"weather_risks"> = {
    field_id: fieldId,
    forecast_at: collectedAt,
    collected_at: collectedAt,
    precipitation: snapshot.precipitation,
    temperature: snapshot.temperature,
    wind: snapshot.wind,
    humidity: snapshot.humidity,
    source_status: sourceStatus,
    summary,
  };

  const { data: insertedRisk, error: insertError } = await supabase
    .from("weather_risks")
    .insert(weatherRisk)
    .select("id")
    .single();
  if (insertError) throw insertError;

  await tryCreateTimelineItem(buildWeatherRiskTimelineItem({
    fieldId,
    weatherRiskId: insertedRisk.id,
    score: riskScore,
    summary,
    createdAt: collectedAt,
  }));

  if (sourceStatus !== "connected" || riskScore === null) return;

  const { error: updateError } = await supabase
    .from("fields")
    .update({
      risk_score: riskScore,
      risk_level: riskLevel,
      updated_at: collectedAt,
    })
    .eq("id", fieldId);

  if (updateError) throw updateError;
}

async function tryPersistWeatherRisk(
  fieldId: string | undefined,
  snapshot: KmaWeatherSnapshot,
  sourceStatus: SourceStatus,
  summary: string,
  collectedAt: string,
  riskScore: number | null,
  riskLevel: RiskLevel,
): Promise<void> {
  try {
    await persistWeatherRisk(fieldId, snapshot, sourceStatus, summary, collectedAt, riskScore, riskLevel);
  } catch {
    // 화면의 실시간 위험도 표시를 DB/RLS 일시 오류와 분리한다.
  }
}

export async function getLiveWeatherByLatLng(
  lat: number,
  lng: number,
  fieldId?: string,
): Promise<LiveWeatherResult> {
  const { nx, ny } = toKmaGrid(lat, lng);
  const now = new Date();

  const ultraBase = resolveKmaBaseDateTime("ultraSrtNcst", now);
  const vilageBase = resolveKmaBaseDateTime("vilageFcst", now);

  try {
    const [ultra, vilage] = await Promise.all([
      fetchKma("ultraSrtNcst", {
        base_date: ultraBase.baseDate,
        base_time: ultraBase.baseTime,
        nx,
        ny,
      }),
      fetchKma("vilageFcst", {
        base_date: vilageBase.baseDate,
        base_time: vilageBase.baseTime,
        nx,
        ny,
      }),
    ]);

    const ultraSnapshot = summarizeKmaWeather(ultra.items);
    const vilageSnapshot = summarizeKmaWeather(vilage.items);

    const merged: KmaWeatherSnapshot = {
      temperature: ultraSnapshot.temperature ?? vilageSnapshot.temperature,
      precipitation: ultraSnapshot.precipitation ?? vilageSnapshot.precipitation,
      wind: ultraSnapshot.wind ?? vilageSnapshot.wind,
      humidity: ultraSnapshot.humidity ?? vilageSnapshot.humidity,
    };
    const assessment = assessWeatherRisk(merged);
    const collectedAt = new Date().toISOString();

    await tryPersistWeatherRisk(
      fieldId,
      merged,
      "connected",
      assessment.summary,
      collectedAt,
      assessment.score,
      assessment.level,
    );

    return {
      ...merged,
      sourceStatus: "connected",
      collectedAt,
      summary: assessment.summary,
      riskScore: assessment.score,
      riskLevel: assessment.level,
      riskFactors: assessment.factors,
    };
  } catch (error) {
    const collectedAt = new Date().toISOString();
    const sourceStatus = mapSourceStatusFromError(error);
    const snapshot: KmaWeatherSnapshot = {
      temperature: null,
      precipitation: null,
      wind: null,
      humidity: null,
    };
    const summary =
      "현재 날씨 데이터를 불러오지 못했습니다. 마지막 수집 정보를 표시하며, 잠시 후 다시 시도할 수 있습니다.";

    await tryPersistWeatherRisk(fieldId, snapshot, sourceStatus, summary, collectedAt, null, "unknown");

    return {
      ...snapshot,
      sourceStatus,
      collectedAt,
      summary,
      riskScore: null,
      riskLevel: "unknown",
      riskFactors: [],
    };
  }
}
