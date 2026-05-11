import { describe, expect, it } from "vitest";
import { attachOfficialSourcesToDiagnosisResult } from "@/domain/ai/diagnosisEvidence";
import type { DiagnosisResult } from "@/domain/ai/diagnosis";

const baseResult: DiagnosisResult = {
  disclaimer: "확정 진단이 아닌 의심 후보입니다.",
  appearanceAssessment: {
    status: "uncertain",
    confidenceBand: "낮음",
    issueLabels: [],
    summary: "외관 스크리닝 정보가 없습니다.",
    visualReasons: [],
    recommendedActions: [],
  },
  candidates: [
    {
      name: "잎도열병",
      confidenceBand: "보통",
      visualReasons: ["잎 반점"],
      weatherReasons: [],
      nextChecks: ["잎 뒷면 확인"],
      officialSources: [],
    },
    {
      name: "깨씨무늬병",
      confidenceBand: "낮음",
      visualReasons: ["반점"],
      weatherReasons: [],
      nextChecks: [],
      officialSources: [],
    },
  ],
  limitations: ["사진 한계"],
  recommendedPhotos: [],
  fieldChecklist: ["피해 위치 기록"],
};

describe("attachOfficialSourcesToDiagnosisResult", () => {
  it("attaches directly matched Nongsaro pest sources to each candidate", () => {
    const enriched = attachOfficialSourcesToDiagnosisResult(baseResult, [
      {
        sourceId: "src-1",
        title: "벼 잎도열병 발생정보",
        publishedAt: "2026-05-01",
        attachmentName: "leaf.pdf",
        attachmentUrl: "https://example.test/leaf.pdf",
      },
    ]);

    expect(enriched.candidates[0].officialSources).toEqual([
      expect.objectContaining({
        sourceId: "src-1",
        title: "벼 잎도열병 발생정보",
        matchReason: "후보명 직접 일치",
      }),
    ]);
    expect(enriched.fieldChecklist).toContain("농사로 공식 발생정보 원문 확인");
  });

  it("uses official crop sources as fallback evidence when names do not match", () => {
    const enriched = attachOfficialSourcesToDiagnosisResult(baseResult, [
      {
        sourceId: "src-2",
        title: "벼 병해충 발생정보 제 4호",
        publishedAt: null,
        attachmentName: null,
        attachmentUrl: null,
      },
    ]);

    expect(enriched.candidates[0].officialSources).toEqual([
      expect.objectContaining({
        sourceId: "src-2",
        matchReason: "작물 공식 발생정보 fallback",
      }),
    ]);
  });
});
