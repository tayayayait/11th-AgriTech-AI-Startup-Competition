import type { FieldRow } from "@/domain/fields/types";
import { sanitizeAiText } from "@/domain/ai/safety";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { analyzeWithGemini } from "@/services/geminiClient";
import {
  getDiagnosisRecordsByField,
  getTaskCardsByField,
  getWeatherRisksForLastDays,
} from "@/services/reportService";
import { getKstDateKey } from "@/domain/nongsaro/weeklyFarmInfo";

type ConsultationMessageRow = Tables<"consultation_messages">;
type ConsultationThreadRow = Tables<"consultation_threads">;

export type ConsultationRole = "user" | "assistant";

type ConsultationFieldLike = FieldRow | {
  id: string;
  name: string;
  address?: string | null;
  crop?: string;
  crop_name?: string;
  growthStage?: string | null;
  growth_stage?: string | null;
  area?: number;
  area_m2?: number;
  riskScore?: number;
  risk_score?: number;
  riskLevel?: string;
  risk_level?: string;
};

export interface ConsultationThread {
  id: string;
  fieldId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface ConsultationMessage {
  id: string;
  fieldId: string;
  threadId: string;
  role: ConsultationRole;
  content: string;
  contextSnapshot: Json;
  createdAt: string;
}

export interface ConsultationWeatherSummary {
  collectionCount: number;
  averageTempC: number | null;
  maxTempC: number | null;
  minTempC: number | null;
  averageHumidityPct: number | null;
  totalRainMm: number;
  maxWindMs: number;
  latestAt: string | null;
}

export interface ConsultationContextSnapshot {
  generatedAt: string;
  field: {
    id: string;
    name: string;
    address: string | null;
    cropName: string;
    growthStage: string | null;
    areaM2: number;
    riskScore: number;
    riskLevel: string;
  };
  weather: ConsultationWeatherSummary;
  weeklyBriefing: ConsultationWeeklyBriefingSummary | null;
  diagnoses: Array<{
    candidateName: string;
    confidenceBand: string | null;
    bodyPart: string | null;
    imageLabel: string | null;
    createdAt: string;
    checklist: Array<{ label: string; done: boolean }>;
  }>;
  taskSummary: {
    pending: number;
    done: number;
    inProgress: number;
    deferred: number;
  };
}

export interface ConsultationWeeklyBriefingSummary {
  title: string;
  periodStart: string | null;
  periodEnd: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  cropName: string | null;
  cropGroup: string | null;
  headline: string;
  summaryBullets: string[];
  actionBullets: string[];
  actionItems: string[];
  cautionBullets: string[];
  evidenceSnippets: string[];
  summaryText: string | null;
  model: string | null;
  fetchedAt: string | null;
}

export interface SendConsultationMessageInput {
  field: ConsultationFieldLike | null;
  threadId?: string | null;
  question: string;
  signal?: AbortSignal;
}

export interface SendConsultationMessageResult {
  answer: string;
  contextSnapshot: ConsultationContextSnapshot;
  thread: ConsultationThread;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function toRecord(value: Json | null | undefined): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return roundOne(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function readFieldString(field: ConsultationFieldLike, snakeKey: keyof FieldRow, camelKey?: string): string | null {
  const source = field as unknown as Record<string, unknown>;
  const value = source[snakeKey] ?? (camelKey ? source[camelKey] : undefined);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFieldNumber(field: ConsultationFieldLike, snakeKey: keyof FieldRow, camelKey?: string): number {
  const source = field as unknown as Record<string, unknown>;
  const value = source[snakeKey] ?? (camelKey ? source[camelKey] : undefined);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toFieldSnapshot(field: ConsultationFieldLike): ConsultationContextSnapshot["field"] {
  return {
    id: field.id,
    name: field.name,
    address: readFieldString(field, "address"),
    cropName: readFieldString(field, "crop_name", "crop") ?? "확실한 정보 없음",
    growthStage: readFieldString(field, "growth_stage", "growthStage"),
    areaM2: readFieldNumber(field, "area_m2", "area"),
    riskScore: readFieldNumber(field, "risk_score", "riskScore"),
    riskLevel: readFieldString(field, "risk_level", "riskLevel") ?? "unknown",
  };
}

function getExpiryIso(): string {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  return expiresAt.toISOString();
}

function buildThreadTitle(question: string): string {
  const normalized = question.replace(/\s+/g, " ").trim();
  if (!normalized) return "새 상담";
  return normalized.length > 40 ? `${normalized.slice(0, 40)}...` : normalized;
}

function mapThread(row: ConsultationThreadRow): ConsultationThread {
  return {
    id: row.id,
    fieldId: row.field_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

function mapMessage(row: ConsultationMessageRow): ConsultationMessage {
  return {
    id: row.id,
    fieldId: row.field_id,
    threadId: row.thread_id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    contextSnapshot: row.context_snapshot,
    createdAt: row.created_at,
  };
}

function summarizeWeather(rows: Awaited<ReturnType<typeof getWeatherRisksForLastDays>>): ConsultationWeatherSummary {
  const temperatures = rows
    .map((row) => row.temperature)
    .filter((value): value is number => typeof value === "number");
  const humidity = rows
    .map((row) => row.humidity)
    .filter((value): value is number => typeof value === "number");
  const rain = rows
    .map((row) => row.precipitation)
    .filter((value): value is number => typeof value === "number");
  const wind = rows
    .map((row) => row.wind)
    .filter((value): value is number => typeof value === "number");

  return {
    collectionCount: rows.length,
    averageTempC: average(temperatures),
    maxTempC: temperatures.length > 0 ? Math.max(...temperatures) : null,
    minTempC: temperatures.length > 0 ? Math.min(...temperatures) : null,
    averageHumidityPct: average(humidity),
    totalRainMm: roundOne(rain.reduce((sum, value) => sum + value, 0)),
    maxWindMs: wind.length > 0 ? Math.max(...wind) : 0,
    latestAt: rows.at(-1)?.forecast_at ?? null,
  };
}

function extractGeminiText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const source = data as Record<string, unknown>;
  const candidates = source.candidates;
  if (!Array.isArray(candidates)) return "";

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }

  return "";
}

function buildPrompt(input: {
  question: string;
  contextSnapshot: ConsultationContextSnapshot;
  recentMessages: ConsultationMessage[];
}): string {
  const recentConversation = input.recentMessages
    .slice(-8)
    .map((message) => `${message.role === "user" ? "농업인" : "AI"}: ${message.content}`)
    .join("\n");

  return [
    "너는 FieldGuard 농업 상담 보조 AI다.",
    "아래 필지 컨텍스트와 최근 대화만 사실로 사용한다.",
    "필지 컨텍스트의 weeklyBriefing은 사용자가 '요약' 버튼으로 생성한 이번 주 농사 브리핑이다. 값이 없으면 브리핑 근거는 없다고 말한다.",
    "모르면 추측하지 말고 '확실한 정보 없음'이라고 답한다.",
    "병해충 확정 진단, 농약 자동 처방, 희석배수/사용량 임의 안내는 금지한다.",
    "농약 사용과 관련되면 공식 안전사용지침, 제품 라벨, 전문가 상담 확인을 안내한다.",
    "답변은 '현재 판단', '확인할 것', '오늘 할 일', '주의사항' 순서로 작성한다.",
    "",
    "필지 컨텍스트:",
    JSON.stringify(input.contextSnapshot, null, 2),
    "",
    "최근 대화:",
    recentConversation || "이전 대화 없음",
    "",
    `농업인 질문: ${input.question}`,
  ].join("\n");
}

async function getCurrentReadyWeeklyBriefing(
  field: ConsultationFieldLike,
): Promise<ConsultationWeeklyBriefingSummary | null> {
  const todayKey = getKstDateKey(new Date());
  const fieldSnapshot = toFieldSnapshot(field);
  const query = supabase
    .from("weekly_farm_infos")
    .select("subject,reg_dt,period_start,period_end,down_url,summary_text,summary_payload,summary_model,summary_fetched_at")
    .eq("summary_status", "ready")
    .contains("summary_payload", { cropName: fieldSnapshot.cropName })
    .lte("period_start", todayKey)
    .gte("period_end", todayKey)
    .order("period_start", { ascending: false })
    .order("reg_dt", { ascending: false })
    .limit(1);

  const { data, error } = await query;
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;

  const payload = toRecord(row.summary_payload);
  const headline = toNullableString(payload?.headline) ?? toNullableString(row.summary_text);
  if (!headline) return null;
  const actionBullets = toStringArray(payload?.actionBullets);

  return {
    title: headline,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    publishedAt: row.reg_dt,
    sourceUrl: row.down_url,
    cropName: toNullableString(payload?.cropName),
    cropGroup: toNullableString(payload?.cropGroup),
    headline,
    summaryBullets: toStringArray(payload?.summaryBullets),
    actionBullets,
    actionItems: actionBullets,
    cautionBullets: toStringArray(payload?.cautionBullets),
    evidenceSnippets: toStringArray(payload?.evidenceSnippets),
    summaryText: row.summary_text,
    model: row.summary_model,
    fetchedAt: row.summary_fetched_at,
  };
}

async function deleteExpiredConsultationThreadsForField(fieldId: string): Promise<void> {
  const { error } = await supabase
    .from("consultation_threads")
    .delete()
    .eq("field_id", fieldId)
    .lte("expires_at", new Date().toISOString());

  if (error) throw error;
}

async function getConsultationThreadById(threadId: string): Promise<ConsultationThread | null> {
  const { data, error } = await supabase
    .from("consultation_threads")
    .select("*")
    .eq("id", threadId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  return data ? mapThread(data) : null;
}

async function touchConsultationThread(input: {
  thread: ConsultationThread;
  question: string;
}): Promise<ConsultationThread> {
  const payload: TablesUpdate<"consultation_threads"> = {
    updated_at: new Date().toISOString(),
    expires_at: getExpiryIso(),
  };

  if (input.thread.title === "새 상담" || input.thread.title.trim().length === 0) {
    payload.title = buildThreadTitle(input.question);
  }

  const { data, error } = await supabase
    .from("consultation_threads")
    .update(payload)
    .eq("id", input.thread.id)
    .select("*")
    .single();

  if (error) throw error;
  return mapThread(data);
}

async function saveConsultationMessage(input: {
  fieldId: string;
  threadId: string;
  role: ConsultationRole;
  content: string;
  contextSnapshot: ConsultationContextSnapshot;
}): Promise<void> {
  const payload: TablesInsert<"consultation_messages"> = {
    field_id: input.fieldId,
    thread_id: input.threadId,
    role: input.role,
    content: input.content,
    context_snapshot: input.contextSnapshot as unknown as Json,
  };

  const { error } = await supabase.from("consultation_messages").insert(payload);
  if (error) throw error;
}

export async function getConsultationThreadsByField(fieldId: string, limit = 20): Promise<ConsultationThread[]> {
  await deleteExpiredConsultationThreadsForField(fieldId);

  const { data, error } = await supabase
    .from("consultation_threads")
    .select("*")
    .eq("field_id", fieldId)
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapThread);
}

export async function createConsultationThread(fieldId: string, title = "새 상담"): Promise<ConsultationThread> {
  const payload: TablesInsert<"consultation_threads"> = {
    field_id: fieldId,
    title: title.trim() || "새 상담",
  };

  const { data, error } = await supabase
    .from("consultation_threads")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return mapThread(data);
}

export async function deleteConsultationThread(fieldId: string, threadId: string): Promise<void> {
  const { error } = await supabase
    .from("consultation_threads")
    .delete()
    .eq("id", threadId)
    .eq("field_id", fieldId);

  if (error) throw error;
}

export async function getConsultationMessagesByThread(threadId: string, limit = 50): Promise<ConsultationMessage[]> {
  const { data, error } = await supabase
    .from("consultation_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapMessage);
}

export async function getConsultationMessagesByField(fieldId: string, limit = 20): Promise<ConsultationMessage[]> {
  const threads = await getConsultationThreadsByField(fieldId, 1);
  const latestThread = threads[0];
  if (!latestThread) return [];
  return getConsultationMessagesByThread(latestThread.id, limit);
}

export async function getConsultationContextSnapshot(field: ConsultationFieldLike): Promise<ConsultationContextSnapshot> {
  const fieldSnapshot = toFieldSnapshot(field);
  const [weatherRows, taskRows, diagnosisRows, weeklyBriefing] = await Promise.all([
    getWeatherRisksForLastDays(field.id, 7),
    getTaskCardsByField(field.id),
    getDiagnosisRecordsByField(field.id, 5),
    getCurrentReadyWeeklyBriefing(field),
  ]);

  const taskSummary = {
    pending: taskRows.filter((task) => task.status === "pending").length,
    done: taskRows.filter((task) => task.status === "done").length,
    inProgress: taskRows.filter((task) => task.status === "in_progress").length,
    deferred: taskRows.filter((task) => task.status === "deferred").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    field: fieldSnapshot,
    weather: summarizeWeather(weatherRows),
    weeklyBriefing,
    diagnoses: diagnosisRows.slice(0, 5).map((record) => ({
      candidateName: record.candidates[0]?.name ?? "확실한 정보 없음",
      confidenceBand: record.confidenceBand,
      bodyPart: record.bodyPart,
      imageLabel: record.imageLabel,
      createdAt: record.createdAt,
      checklist: record.checklist,
    })),
    taskSummary,
  };
}

export async function sendConsultationMessage(
  input: SendConsultationMessageInput,
): Promise<SendConsultationMessageResult> {
  const question = input.question.trim();
  if (!input.field) throw new Error("선택된 필지가 없습니다.");
  if (!question) throw new Error("질문을 입력하세요.");

  const thread = input.threadId
    ? await getConsultationThreadById(input.threadId)
    : await createConsultationThread(input.field.id);
  if (!thread || thread.fieldId !== input.field.id) {
    throw new Error("상담 기록을 찾을 수 없습니다.");
  }

  const [contextSnapshot, recentMessages] = await Promise.all([
    getConsultationContextSnapshot(input.field),
    getConsultationMessagesByThread(thread.id, 12),
  ]);

  await saveConsultationMessage({
    fieldId: input.field.id,
    threadId: thread.id,
    role: "user",
    content: question,
    contextSnapshot,
  });

  const response = await analyzeWithGemini(
    {
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt({ question, contextSnapshot, recentMessages }) }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        maxOutputTokens: 1400,
      },
    },
    { signal: input.signal, timeout: 25000 },
  );

  const answer = sanitizeAiText(extractGeminiText(response.data));

  await saveConsultationMessage({
    fieldId: input.field.id,
    threadId: thread.id,
    role: "assistant",
    content: answer,
    contextSnapshot,
  });

  const updatedThread = await touchConsultationThread({ thread, question });
  return { answer, contextSnapshot, thread: updatedThread };
}
