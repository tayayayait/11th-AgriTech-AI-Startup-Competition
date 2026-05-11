import { describe, expect, it } from "vitest";
import {
  getDiagnosisResponseJsonSchema,
  MARKETABILITY_CHECK_GUIDANCE,
  parseDiagnosisFromGeminiResponse,
} from "@/domain/ai/diagnosis";

describe("parseDiagnosisFromGeminiResponse", () => {
  it("parses JSON text from Gemini candidates", () => {
    const parsed = parseDiagnosisFromGeminiResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  disclaimer: "확정 진단이 아닌 의심 후보입니다.",
                  candidates: [
                    {
                      name: "노균병 의심",
                      confidenceBand: "보통",
                      visualReasons: ["잎 표면 황화"],
                      weatherReasons: ["고습 조건"],
                      nextChecks: ["잎 뒷면 확인"],
                    },
                  ],
                  limitations: ["사진만으로 확정할 수 없음"],
                  recommendedPhotos: ["잎 뒷면"],
                  fieldChecklist: ["배수 상태 확인"],
                }),
              },
            ],
          },
        },
      ],
    });

    expect(parsed.candidates[0].name).toBe("노균병 의심");
    expect(parsed.fieldChecklist).toEqual(["배수 상태 확인"]);
  });

  it("throws when Gemini text cannot be parsed as JSON", () => {
    expect(() =>
      parseDiagnosisFromGeminiResponse({
        candidates: [{ content: { parts: [{ text: "not json" }] } }],
      }),
    ).toThrow("Gemini JSON");
  });

  it("normalizes simplified Gemini JSON keys", () => {
    const parsed = parseDiagnosisFromGeminiResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  candidates: [
                    {
                      name: "잎도열병",
                      confidence: "medium",
                      reasons: ["잎 표면 갈색 병반"],
                      checks: ["잎 뒷면 병반 확인"],
                    },
                  ],
                  limitations: ["사진만으로 확정 진단 불가"],
                  photos: ["잎 뒷면 확대 사진"],
                  checklist: ["피해 포기 위치 기록"],
                }),
              },
            ],
          },
        },
      ],
    });

    expect(parsed.candidates[0]).toMatchObject({
      name: "잎도열병",
      confidenceBand: "보통",
      visualReasons: ["잎 표면 갈색 병반"],
      nextChecks: ["잎 뒷면 병반 확인"],
    });
    expect(parsed.recommendedPhotos).toEqual(["잎 뒷면 확대 사진"]);
    expect(parsed.fieldChecklist).toEqual(["피해 포기 위치 기록"]);
  });

  it("normalizes crop-agnostic appearance assessment separately from NCPMS candidates", () => {
    const parsed = parseDiagnosisFromGeminiResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  appearanceAssessment: {
                    status: "abnormal",
                    confidence: "high",
                    labels: ["부패 의심", "곰팡이 의심"],
                    summary: "열매 표면에 회백색 부착물과 물러진 변색 부위가 보입니다.",
                    reasons: ["표면 부착물", "갈변과 물러짐"],
                    actions: ["오염 부위를 분리하고 선별 기준을 확인하세요."],
                  },
                  candidates: [],
                  limitations: ["NCPMS 병해충 후보와 명확히 연결되는 근거는 부족합니다."],
                  photos: ["이상 부위 근접 사진"],
                  checklist: ["부패 범위를 확인하세요."],
                }),
              },
            ],
          },
        },
      ],
    });

    expect(parsed.appearanceAssessment).toMatchObject({
      status: "abnormal",
      confidenceBand: "높음",
      issueLabels: ["부패 의심", "곰팡이 의심"],
      summary: "열매 표면에 회백색 부착물과 물러진 변색 부위가 보입니다.",
      visualReasons: ["표면 부착물", "갈변과 물러짐"],
      recommendedActions: ["오염 부위를 분리하고 선별 기준을 확인하세요."],
    });
    expect(parsed.candidates).toEqual([]);
  });

  it("keeps only Gemini candidates that match provided NCPMS candidate IDs", () => {
    const parsed = parseDiagnosisFromGeminiResponse(
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    candidates: [
                      {
                        candidateId: "VC010803:SVC05:D00004102",
                        name: "Gemini 임의 이름",
                        confidence: "high",
                        summary: "잎 반점과 줄기 병징이 비슷합니다.",
                        reasons: ["잎 가장자리 반점"],
                        checks: ["잎 뒷면을 확인하세요."],
                      },
                      {
                        candidateId: "outside-id",
                        name: "목록 밖 병명",
                        confidence: "high",
                        summary: "목록 밖 후보입니다.",
                        reasons: ["제거되어야 합니다."],
                        checks: ["제거되어야 합니다."],
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      },
      [
        {
          id: "VC010803:SVC05:D00004102",
          name: "궤양병",
        },
      ],
    );

    expect(parsed.candidates).toHaveLength(1);
    expect(parsed.candidates[0]).toMatchObject({
      sourceCandidateId: "VC010803:SVC05:D00004102",
      name: "궤양병",
      confidenceBand: "높음",
      summary: "잎 반점과 줄기 병징이 비슷합니다.",
      visualReasons: ["잎 가장자리 반점"],
      nextChecks: ["잎 뒷면을 확인하세요."],
    });
  });

  it("keeps empty candidates for no visible symptom JSON under NCPMS constraints", () => {
    const parsed = parseDiagnosisFromGeminiResponse(
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    candidates: [],
                    limitations: ["사진에서 병징 또는 해충 피해가 확인되지 않습니다."],
                    photos: [],
                    checklist: [],
                  }),
                },
              ],
            },
          },
        ],
      },
      [{ id: "FC010101:SVC05:D00000815", name: "잎도열병" }],
    );

    expect(parsed.candidates).toEqual([]);
    expect(parsed.appearanceAssessment.status).toBe("uncertain");
    expect(parsed.limitations).toContain("사진에서 병징 또는 해충 피해가 확인되지 않습니다.");
    expect(parsed.limitations).not.toContain("NCPMS 후보 목록 안에서 선택된 후보가 없습니다.");
    expect(parsed.recommendedPhotos).toContain("병반, 변색, 상처, 벌레, 피해 부위가 보이는 경우 가까이 촬영하세요.");
    expect(parsed.fieldChecklist).toContain(MARKETABILITY_CHECK_GUIDANCE);
  });

  it("uses a simplified JSON schema for Gemini response", () => {
    const schema = getDiagnosisResponseJsonSchema();
    const candidates = schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, unknown>).candidates
      : null;
    const items = candidates && typeof candidates === "object"
      ? (candidates as { items?: unknown }).items
      : null;
    const itemProperties = items && typeof items === "object"
      ? (items as { properties?: Record<string, unknown>; required?: unknown }).properties
      : null;

    expect(itemProperties).toEqual(
      expect.objectContaining({
        candidateId: { type: "string" },
        name: { type: "string" },
        confidence: { type: "string" },
        summary: { type: "string" },
        reasons: { type: "array", items: { type: "string" } },
        checks: { type: "array", items: { type: "string" } },
      }),
    );
    expect(items && typeof items === "object" ? (items as { required?: unknown }).required : undefined).toBeUndefined();
  });
});
