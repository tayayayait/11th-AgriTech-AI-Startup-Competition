import { describe, expect, it } from "vitest";
import {
  buildDiagnosisTimelineItem,
  buildPestRiskTimelineItem,
  buildReportTimelineItem,
  buildTaskDoneTimelineItem,
  buildWeatherRiskTimelineItem,
} from "@/domain/timeline/timelineItems";

describe("timeline item builders", () => {
  it("builds a weather risk timeline item", () => {
    expect(buildWeatherRiskTimelineItem({
      fieldId: "field-1",
      weatherRiskId: "weather-1",
      score: 72,
      summary: "강풍 위험",
      createdAt: "2026-05-06T08:00:00.000Z",
    })).toEqual({
      field_id: "field-1",
      type: "risk",
      title: "날씨 위험 수집",
      summary: "위험도 72점 · 강풍 위험",
      source_ids: ["weather_risks:weather-1"],
      created_at: "2026-05-06T08:00:00.000Z",
    });
  });

  it("builds pest, diagnosis, task, and report timeline items", () => {
    expect(buildPestRiskTimelineItem({
      fieldId: "field-1",
      pestRiskId: "pest-1",
      candidateName: "깨씨무늬병",
      score: 64,
      reasons: ["고습"],
      createdAt: "2026-05-06T09:00:00.000Z",
    })).toMatchObject({
      field_id: "field-1",
      type: "risk",
      title: "병해충 위험 예보",
      summary: "깨씨무늬병 · 위험도 64점 · 고습",
      source_ids: ["pest_risks:pest-1"],
    });

    expect(buildDiagnosisTimelineItem({
      fieldId: "field-1",
      diagnosisId: "diagnosis-1",
      candidateName: "잎도열병",
      confidenceBand: "medium",
      createdAt: "2026-05-06T10:00:00.000Z",
    })).toMatchObject({
      type: "diagnosis",
      title: "사진 진단 저장",
      summary: "의심 후보 잎도열병 · 신뢰도 medium",
      source_ids: ["diagnosis_records:diagnosis-1"],
    });

    expect(buildTaskDoneTimelineItem({
      fieldId: "field-1",
      taskId: "task-1",
      title: "배수로 점검",
      completedAt: "2026-05-06T11:00:00.000Z",
    })).toMatchObject({
      type: "task",
      title: "작업 완료",
      summary: "배수로 점검",
      source_ids: ["task_cards:task-1"],
    });

    expect(buildReportTimelineItem({
      fieldId: "field-1",
      reportId: "report-1",
      period: "최근 7일",
      createdAt: "2026-05-06T12:00:00.000Z",
    })).toMatchObject({
      type: "report",
      title: "상담자료 생성",
      summary: "상담 리포트 · 최근 7일",
      source_ids: ["reports:report-1"],
    });
  });
});
