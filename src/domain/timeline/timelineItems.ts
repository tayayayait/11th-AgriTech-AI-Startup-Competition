import type { TablesInsert } from "@/integrations/supabase/types";

export type TimelineItemInsert = TablesInsert<"timeline_items">;

interface BaseTimelineInput {
  fieldId: string;
  createdAt: string;
}

export interface WeatherRiskTimelineInput extends BaseTimelineInput {
  weatherRiskId: string;
  score: number | null;
  summary: string;
}

export interface PestRiskTimelineInput extends BaseTimelineInput {
  pestRiskId: string;
  candidateName: string;
  score: number;
  reasons: string[];
}

export interface DiagnosisTimelineInput extends BaseTimelineInput {
  diagnosisId: string;
  candidateName: string | null;
  confidenceBand: string | null;
}

export interface TaskDoneTimelineInput {
  fieldId: string;
  taskId: string;
  title: string;
  completedAt: string;
}

export interface ReportTimelineInput extends BaseTimelineInput {
  reportId: string;
  period: string | null;
}

function compactSummary(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function buildWeatherRiskTimelineItem(input: WeatherRiskTimelineInput): TimelineItemInsert {
  return {
    field_id: input.fieldId,
    type: "risk",
    title: "날씨 위험 수집",
    summary: compactSummary([
      input.score == null ? "위험도 확인 불가" : `위험도 ${input.score}점`,
      input.summary,
    ]),
    source_ids: [`weather_risks:${input.weatherRiskId}`],
    created_at: input.createdAt,
  };
}

export function buildPestRiskTimelineItem(input: PestRiskTimelineInput): TimelineItemInsert {
  return {
    field_id: input.fieldId,
    type: "risk",
    title: "병해충 위험 예보",
    summary: compactSummary([
      input.candidateName,
      `위험도 ${input.score}점`,
      input.reasons.slice(0, 2).join(" · "),
    ]),
    source_ids: [`pest_risks:${input.pestRiskId}`],
    created_at: input.createdAt,
  };
}

export function buildDiagnosisTimelineItem(input: DiagnosisTimelineInput): TimelineItemInsert {
  return {
    field_id: input.fieldId,
    type: "diagnosis",
    title: "사진 진단 저장",
    summary: compactSummary([
      input.candidateName ? `의심 후보 ${input.candidateName}` : "의심 후보 확인 불가",
      input.confidenceBand ? `신뢰도 ${input.confidenceBand}` : null,
    ]),
    source_ids: [`diagnosis_records:${input.diagnosisId}`],
    created_at: input.createdAt,
  };
}

export function buildTaskDoneTimelineItem(input: TaskDoneTimelineInput): TimelineItemInsert {
  return {
    field_id: input.fieldId,
    type: "task",
    title: "작업 완료",
    summary: input.title,
    source_ids: [`task_cards:${input.taskId}`],
    created_at: input.completedAt,
  };
}

export function buildReportTimelineItem(input: ReportTimelineInput): TimelineItemInsert {
  return {
    field_id: input.fieldId,
    type: "report",
    title: "상담자료 생성",
    summary: compactSummary(["상담 리포트", input.period]),
    source_ids: [`reports:${input.reportId}`],
    created_at: input.createdAt,
  };
}
