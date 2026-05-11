import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert } from "@/integrations/supabase/types";
import { buildReportTimelineItem } from "@/domain/timeline/timelineItems";
import { tryCreateTimelineItem } from "@/services/timelineService";

type PesticideLookupRow = Tables<"pesticide_lookups">;
type WeatherRiskRow = Tables<"weather_risks">;
type PestRiskRow = Tables<"pest_risks">;
type TaskCardRow = Tables<"task_cards">;
type DiagnosisRecordRow = Tables<"diagnosis_records">;
type ReportRow = Tables<"reports">;

export interface PesticideLookupFilters {
  cropName?: string;
  targetKeyword?: string;
  itemKeyword?: string;
  maxPreHarvestDays?: number | null;
  limit?: number;
}

export interface ReportTaskCheck {
  label: string;
  done: boolean;
}

export interface ReportDiagnosisCandidate {
  name: string;
  confidenceBand: string;
}

export interface ReportDiagnosisRecord {
  id: string;
  createdAt: string;
  cropName: string | null;
  bodyPart: string | null;
  imageLabel: string | null;
  confidenceBand: string | null;
  candidates: ReportDiagnosisCandidate[];
  checklist: ReportTaskCheck[];
}

export interface ReportTaskCardItem {
  id: string;
  title: string;
  reason: string | null;
  status: string;
  priority: number;
  durationMin: number | null;
  completedAt: string | null;
  checks: ReportTaskCheck[];
}

export interface ReportHistoryItem {
  id: string;
  fieldId: string | null;
  period: string | null;
  createdAt: string;
  summary: Json;
}

function toStringArray(value: Json): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toTaskChecks(value: Json): ReportTaskCheck[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = typeof item.label === "string" ? item.label.trim() : "";
      if (!label) return null;
      return { label, done: Boolean(item.done) };
    })
    .filter((item): item is ReportTaskCheck => item !== null);
}

function toDiagnosisCandidates(value: Json): ReportDiagnosisCandidate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!name) return null;
      const confidenceBand =
        typeof item.confidenceBand === "string" ? item.confidenceBand.trim() : "확실한 정보 없음";
      return { name, confidenceBand };
    })
    .filter((item): item is ReportDiagnosisCandidate => item !== null);
}

function mapTaskCard(row: TaskCardRow): ReportTaskCardItem {
  return {
    id: row.id,
    title: row.title,
    reason: row.reason,
    status: row.status,
    priority: row.priority,
    durationMin: row.duration_min,
    completedAt: row.completed_at,
    checks: toTaskChecks(row.checks),
  };
}

function mapDiagnosisRecord(row: DiagnosisRecordRow): ReportDiagnosisRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    cropName: row.crop_name,
    bodyPart: row.body_part,
    imageLabel: row.image_name ?? row.image_url,
    confidenceBand: row.confidence_band,
    candidates: toDiagnosisCandidates(row.candidates),
    checklist: toTaskChecks(row.checklist),
  };
}

function mapReportHistoryRow(row: ReportRow): ReportHistoryItem {
  return {
    id: row.id,
    fieldId: row.field_id,
    period: row.period,
    createdAt: row.created_at,
    summary: row.summary,
  };
}

function getSinceIso(days: number): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - Math.max(days - 1, 0));
  return start.toISOString();
}

export async function getPesticideLookups(filters?: PesticideLookupFilters): Promise<PesticideLookupRow[]> {
  const limit = filters?.limit ?? 200;
  const cropName = filters?.cropName?.trim() ?? "";
  const targetKeyword = filters?.targetKeyword?.trim() ?? "";
  const itemKeyword = filters?.itemKeyword?.trim() ?? "";

  let query = supabase
    .from("pesticide_lookups")
    .select("*")
    .order("crop")
    .order("target")
    .order("item")
    .limit(limit);

  if (cropName) {
    query = query.ilike("crop", `%${cropName}%`);
  }
  if (targetKeyword) {
    query = query.ilike("target", `%${targetKeyword}%`);
  }
  if (itemKeyword) {
    query = query.ilike("item", `%${itemKeyword}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const maxPreHarvestDays = filters?.maxPreHarvestDays;
  if (maxPreHarvestDays == null) return rows;

  return rows.filter((row) => {
    if (row.pre_harvest_days == null) return false;
    return row.pre_harvest_days <= maxPreHarvestDays;
  });
}

export async function getWeatherRisksForLastDays(fieldId: string, days = 7): Promise<WeatherRiskRow[]> {
  const { data, error } = await supabase
    .from("weather_risks")
    .select("*")
    .eq("field_id", fieldId)
    .gte("forecast_at", getSinceIso(days))
    .order("forecast_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getPestRisksForLastDays(fieldId: string, days = 7): Promise<PestRiskRow[]> {
  const { data, error } = await supabase
    .from("pest_risks")
    .select("*")
    .eq("field_id", fieldId)
    .gte("created_at", getSinceIso(days))
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getTaskCardsByField(fieldId: string): Promise<ReportTaskCardItem[]> {
  const { data, error } = await supabase
    .from("task_cards")
    .select("*")
    .eq("field_id", fieldId)
    .order("priority")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapTaskCard);
}

export async function getDiagnosisRecordsByField(fieldId: string, limit = 20): Promise<ReportDiagnosisRecord[]> {
  const { data, error } = await supabase
    .from("diagnosis_records")
    .select("*")
    .eq("field_id", fieldId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapDiagnosisRecord);
}

export async function getReportHistoryByField(fieldId: string, limit = 10): Promise<ReportHistoryItem[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("field_id", fieldId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapReportHistoryRow);
}

interface CreateConsultationReportInput {
  fieldId: string;
  period: string;
  summary: Json;
}

export async function createConsultationReportRecord(input: CreateConsultationReportInput): Promise<string> {
  const payload: TablesInsert<"reports"> = {
    field_id: input.fieldId,
    period: input.period,
    summary: input.summary,
  };

  const { data, error } = await supabase
    .from("reports")
    .insert(payload)
    .select("id,created_at")
    .single();

  if (error) throw error;
  await tryCreateTimelineItem(buildReportTimelineItem({
    fieldId: input.fieldId,
    reportId: data.id,
    period: input.period,
    createdAt: data.created_at ?? new Date().toISOString(),
  }));
  return data.id;
}

export function buildRiskTrendByDate(pestRisks: PestRiskRow[]): Array<{ date: string; score: number }> {
  const scoreByDate = new Map<string, number>();

  for (const row of pestRisks) {
    const dateKey = row.created_at.slice(0, 10);
    const current = scoreByDate.get(dateKey) ?? 0;
    if (row.score > current) {
      scoreByDate.set(dateKey, row.score);
    }
  }

  return Array.from(scoreByDate.entries())
    .map(([date, score]) => ({ date, score }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function summarizeOfficialSourcesFromPestRisks(pestRisks: PestRiskRow[]): string[] {
  const merged = new Set<string>();
  for (const row of pestRisks) {
    toStringArray(row.official_sources).forEach((source) => merged.add(source));
  }
  return Array.from(merged).slice(0, 8);
}
