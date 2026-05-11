import { scoreToLevel as scoreToRiskLevel } from "@/domain/risk/risk";
import type { RiskLevel } from "@/domain/risk/risk";
export type { RiskLevel };

// FieldGuard AI 카피 가이드 — 상세서 1장 기반
// 금지: 확진, 반드시 방제, 이 농약을 사용하세요, 병명이 확실합니다, 안전합니다
// 허용: 의심, 가능성, 위험 상승, 공식 자료 확인 필요, 전문가 상담 권장, 현장 확인 필요

export const AI_DIAGNOSIS_DISCLAIMER =
  "사진과 NCPMS 도감정보를 비교한 의심 후보이며 확정 진단/처방이 아닙니다.";

export const PESTICIDE_DISCLAIMER =
  "FieldGuard AI는 농약을 처방하지 않습니다. 실제 사용 전 PSIS 등록정보, 농사로 공식 지침, 제품 라벨, 전문가 상담을 확인하세요.";

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "낮음",
  watch: "주의",
  high: "높음",
  critical: "긴급",
  unknown: "데이터 없음",
};

export const scoreToLevel = scoreToRiskLevel;

export function m2ToPyeong(m2: number): number {
  return Math.round(m2 * 0.3025);
}
