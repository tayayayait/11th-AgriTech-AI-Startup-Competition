import { sanitizeAiText, sanitizeAiTextList } from "@/domain/ai/safety";
import { z } from "zod";

const FALLBACK_TEXT = "확실한 정보 없음";
export const NO_VISIBLE_SYMPTOM_LIMITATION = "사진에서 병징 또는 해충 피해가 확인되지 않습니다.";
export const NO_VISIBLE_SYMPTOM_EVIDENCE_LIMITATION =
  "사진에서 NCPMS 병해충 후보와 연결할 뚜렷한 병징/해충 피해 근거가 확인되지 않았습니다.";
export const MARKETABILITY_CHECK_GUIDANCE =
  "판매 가능 여부는 사진 판독만으로 확정하지 않습니다. 크기, 상처, 부패, 당도, 잔류농약, 선별 기준을 별도로 확인하세요.";

const appearanceAssessmentSchema = z.object({
  status: z.enum(["normal", "abnormal", "uncertain"]),
  confidenceBand: z.enum(["낮음", "보통", "높음"]),
  issueLabels: z.array(z.string()),
  summary: z.string().min(1),
  visualReasons: z.array(z.string()),
  recommendedActions: z.array(z.string()),
});

const diagnosisOfficialSourceSchema = z.object({
  sourceId: z.string().min(1),
  title: z.string().min(1),
  publishedAt: z.string().nullable(),
  attachmentUrl: z.string().nullable(),
  matchReason: z.string().min(1),
});

const diagnosisCandidateSchema = z.object({
  sourceCandidateId: z.string().nullable(),
  name: z.string().min(1),
  confidenceBand: z.enum(["낮음", "보통", "높음"]),
  summary: z.string().min(1),
  visualReasons: z.array(z.string()),
  weatherReasons: z.array(z.string()),
  nextChecks: z.array(z.string()),
  officialSources: z.array(diagnosisOfficialSourceSchema),
});

const diagnosisResultSchema = z.object({
  disclaimer: z.string().min(1),
  appearanceAssessment: appearanceAssessmentSchema,
  candidates: z.array(diagnosisCandidateSchema).max(3),
  limitations: z.array(z.string()),
  recommendedPhotos: z.array(z.string()),
  fieldChecklist: z.array(z.string()),
});

export type DiagnosisCandidate = z.infer<typeof diagnosisCandidateSchema>;
export type DiagnosisOfficialSource = z.infer<typeof diagnosisOfficialSourceSchema>;
export type AppearanceAssessment = z.infer<typeof appearanceAssessmentSchema>;
export type DiagnosisResult = z.infer<typeof diagnosisResultSchema>;

export interface DiagnosisCandidateReference {
  id: string;
  name: string;
}

function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function toConfidenceBand(input: unknown): "낮음" | "보통" | "높음" {
  if (typeof input !== "string") return "보통";

  if (input.includes("높")) return "높음";
  if (input.includes("낮")) return "낮음";

  const lower = input.toLowerCase();
  if (lower.includes("high")) return "높음";
  if (lower.includes("low")) return "낮음";
  return "보통";
}

function toAppearanceStatus(input: unknown): AppearanceAssessment["status"] {
  if (typeof input !== "string") return "uncertain";

  const normalized = input.trim().toLowerCase();
  if (
    normalized.includes("abnormal") ||
    normalized.includes("비정상") ||
    normalized.includes("이상") ||
    normalized.includes("불량") ||
    normalized.includes("부패")
  ) {
    return "abnormal";
  }
  if (normalized.includes("normal") || normalized.includes("정상")) {
    return "normal";
  }
  return "uncertain";
}

function defaultAppearanceAssessment(): AppearanceAssessment {
  return {
    status: "uncertain",
    confidenceBand: "낮음",
    issueLabels: [],
    summary: "외관 스크리닝 정보가 없습니다.",
    visualReasons: [],
    recommendedActions: [],
  };
}

function normalizeAppearanceAssessment(input: unknown): AppearanceAssessment {
  if (!input || typeof input !== "object") return defaultAppearanceAssessment();

  const source = input as Record<string, unknown>;
  const status = toAppearanceStatus(source.status);
  const issueLabels = sanitizeAiTextList(
    toStringArray(source.issueLabels ?? source.issue_labels ?? source.labels ?? source.issues).slice(0, 6),
  );
  const visualReasons = sanitizeAiTextList(
    toStringArray(source.visualReasons ?? source.visual_reasons ?? source.reasons ?? source.findings).slice(0, 5),
  );
  const recommendedActions = sanitizeAiTextList(
    toStringArray(source.recommendedActions ?? source.recommended_actions ?? source.actions ?? source.checks).slice(0, 5),
  );
  const fallbackSummary = status === "abnormal"
    ? "외관상 이상 소견이 있습니다."
    : status === "normal"
      ? "사진상 뚜렷한 외관 이상은 확인되지 않았습니다."
      : "외관 스크리닝 정보가 부족합니다.";

  return appearanceAssessmentSchema.parse({
    status,
    confidenceBand: toConfidenceBand(source.confidenceBand ?? source.confidence),
    issueLabels,
    summary: sanitizeAiText(typeof source.summary === "string" && source.summary.trim() ? source.summary : fallbackSummary),
    visualReasons,
    recommendedActions,
  });
}

function toOfficialSources(input: unknown): DiagnosisOfficialSource[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const normalized = {
        sourceId: sanitizeAiText(typeof source.sourceId === "string" ? source.sourceId : ""),
        title: sanitizeAiText(typeof source.title === "string" ? source.title : ""),
        publishedAt: typeof source.publishedAt === "string" ? source.publishedAt : null,
        attachmentUrl: typeof source.attachmentUrl === "string" ? source.attachmentUrl : null,
        matchReason: sanitizeAiText(typeof source.matchReason === "string" ? source.matchReason : "NCPMS 공식 도감정보"),
      };
      const parsed = diagnosisOfficialSourceSchema.safeParse(normalized);
      return parsed.success ? parsed.data : null;
    })
    .filter((item): item is DiagnosisOfficialSource => item !== null)
    .slice(0, 3);
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
  } catch (error) {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const sliced = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(sliced);
      } catch (innerError) {
        const parseError = new Error("Gemini JSON 파싱 실패");
        (parseError as Error & { cause?: unknown }).cause = innerError;
        throw parseError;
      }
    }
    const parseError = new Error("Gemini JSON 파싱 실패");
    (parseError as Error & { cause?: unknown }).cause = error;
    throw parseError;
  }
}

function extractGeminiJsonCandidate(responseData: unknown): unknown {
  if (!responseData || typeof responseData !== "object") {
    throw new Error("Gemini 응답 형식이 비어 있습니다.");
  }

  const source = responseData as Record<string, unknown>;
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
        if (typeof text === "string" && text.trim()) {
          return parseJsonText(text);
        }
      }
    }
  }

  if ("disclaimer" in source || "fieldChecklist" in source || "limitations" in source) {
    return source;
  }

  throw new Error("Gemini 응답에서 JSON 결과를 찾지 못했습니다.");
}

function normalizeCandidate(
  input: unknown,
  candidateMap?: Map<string, DiagnosisCandidateReference>,
): DiagnosisCandidate | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const candidateId = typeof source.candidateId === "string"
    ? source.candidateId.trim()
    : typeof source.sourceCandidateId === "string"
      ? source.sourceCandidateId.trim()
      : "";
  const reference = candidateId ? candidateMap?.get(candidateId) : null;
  if (candidateMap && !reference) return null;

  const visualReasons = sanitizeAiTextList(
    toStringArray(source.visualReasons ?? source.reasons ?? source.visual_reasons).slice(0, 3),
  );
  const summary = typeof source.summary === "string" && source.summary.trim()
    ? source.summary
    : visualReasons[0] ?? FALLBACK_TEXT;

  const normalized = {
    sourceCandidateId: reference?.id ?? (candidateId || null),
    name: sanitizeAiText(reference?.name ?? (typeof source.name === "string" ? source.name : FALLBACK_TEXT)),
    confidenceBand: toConfidenceBand(source.confidenceBand ?? source.confidence),
    summary: sanitizeAiText(summary),
    visualReasons,
    weatherReasons: sanitizeAiTextList(toStringArray(source.weatherReasons ?? source.weather_reasons).slice(0, 3)),
    nextChecks: sanitizeAiTextList(toStringArray(source.nextChecks ?? source.checks ?? source.next_checks).slice(0, 5)),
    officialSources: toOfficialSources(source.officialSources ?? source.official_sources),
  };

  const parsed = diagnosisCandidateSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

export function createLimitedDiagnosisResult(reason: string): DiagnosisResult {
  return diagnosisResultSchema.parse({
    disclaimer: "사진과 NCPMS 도감정보를 비교한 의심 후보이며 확정 진단/처방이 아닙니다.",
    appearanceAssessment: defaultAppearanceAssessment(),
    candidates: [],
    limitations: [reason],
    recommendedPhotos: ["병반, 변색, 상처, 벌레, 피해 부위가 보이도록 가까이 촬영하세요."],
    fieldChecklist: ["작물명을 다시 확인하세요.", "병징 또는 해충 피해가 있는 부위를 앞면과 뒷면 모두 촬영하세요."],
  });
}

export function hasNoVisibleSymptomLimitation(limitations: string[]): boolean {
  return limitations.some((item) =>
    item.includes("병징 또는 해충 피해가 확인되지 않습니다") ||
    item.includes("병징/해충 피해 근거가 확인되지 않았습니다"),
  );
}

export function parseDiagnosisFromGeminiResponse(
  responseData: unknown,
  candidateReferences?: DiagnosisCandidateReference[],
): DiagnosisResult {
  const rawPayload = extractGeminiJsonCandidate(responseData);
  if (!rawPayload || typeof rawPayload !== "object") {
    throw new Error("Gemini JSON 결과가 비어 있습니다.");
  }

  const source = rawPayload as Record<string, unknown>;
  const candidateMap = candidateReferences
    ? new Map(candidateReferences.map((reference) => [reference.id, reference]))
    : undefined;
  const normalizedCandidates = Array.isArray(source.candidates)
    ? source.candidates
      .map((candidate) => normalizeCandidate(candidate, candidateMap))
      .filter((item): item is DiagnosisCandidate => item !== null)
      .slice(0, 3)
    : [];

  const normalized = {
    disclaimer: sanitizeAiText(
      typeof source.disclaimer === "string"
        ? source.disclaimer
        : "확정 진단이 아닌 의심 후보입니다.",
    ),
    appearanceAssessment: normalizeAppearanceAssessment(
      source.appearanceAssessment ?? source.appearance_assessment ?? source.visualAssessment ?? source.visual_assessment,
    ),
    candidates: normalizedCandidates,
    limitations: sanitizeAiTextList(toStringArray(source.limitations).slice(0, 5)),
    recommendedPhotos: sanitizeAiTextList(
      toStringArray(source.recommendedPhotos ?? source.recommended_photos ?? source.photos).slice(0, 5),
    ),
    fieldChecklist: sanitizeAiTextList(
      toStringArray(source.fieldChecklist ?? source.field_checklist ?? source.checklist).slice(0, 7),
    ),
  };

  if (!normalized.candidates.length) {
    if (candidateReferences) {
      if (candidateReferences.length === 0) {
        normalized.limitations = Array.from(new Set([
          ...normalized.limitations,
          "NCPMS 후보 없음. 작물명을 확인한 뒤 다시 시도하세요.",
        ]));
        if (!normalized.recommendedPhotos.length) {
          normalized.recommendedPhotos.push("병반, 변색, 상처, 벌레, 피해 부위가 보이도록 가까이 촬영하세요.");
        }
        return diagnosisResultSchema.parse(normalized);
      }

      if (hasNoVisibleSymptomLimitation(normalized.limitations)) {
        if (!normalized.recommendedPhotos.length) {
          normalized.recommendedPhotos.push("병반, 변색, 상처, 벌레, 피해 부위가 보이는 경우 가까이 촬영하세요.");
        }
        if (!normalized.fieldChecklist.length) {
          normalized.fieldChecklist.push(MARKETABILITY_CHECK_GUIDANCE);
        }
        return diagnosisResultSchema.parse(normalized);
      }

      normalized.limitations = Array.from(new Set([
        ...normalized.limitations,
        "NCPMS 후보 목록 안에서 선택된 후보가 없습니다.",
      ]));
      if (!normalized.recommendedPhotos.length) {
        normalized.recommendedPhotos.push("병반, 변색, 상처, 벌레, 피해 부위가 보이도록 가까이 촬영하세요.");
      }
      return diagnosisResultSchema.parse(normalized);
    }

    if (Array.isArray(source.candidates)) {
      return diagnosisResultSchema.parse(normalized);
    }

    normalized.candidates.push({
      sourceCandidateId: null,
      name: FALLBACK_TEXT,
      confidenceBand: "낮음",
      summary: FALLBACK_TEXT,
      visualReasons: [FALLBACK_TEXT],
      weatherReasons: [],
      nextChecks: ["현장 점검 후 공식 자료를 확인하세요."],
      officialSources: [],
    });
  }

  return diagnosisResultSchema.parse(normalized);
}

export function getDiagnosisResponseJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      appearanceAssessment: {
        type: "object",
        properties: {
          status: { type: "string" },
          confidence: { type: "string" },
          labels: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
          reasons: { type: "array", items: { type: "string" } },
          actions: { type: "array", items: { type: "string" } },
        },
      },
      candidates: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            candidateId: { type: "string" },
            confidence: { type: "string" },
            summary: { type: "string" },
            reasons: { type: "array", items: { type: "string" } },
            checks: { type: "array", items: { type: "string" } },
          },
        },
      },
      limitations: { type: "array", items: { type: "string" } },
      photos: { type: "array", items: { type: "string" } },
      checklist: { type: "array", items: { type: "string" } },
    },
  };
}
