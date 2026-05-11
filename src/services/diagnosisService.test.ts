import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_VISIBLE_SYMPTOM_EVIDENCE_LIMITATION } from "@/domain/ai/diagnosis";
import { runPhotoDiagnosis } from "@/services/diagnosisService";
import { analyzeWithGemini } from "@/services/geminiClient";

vi.mock("@/services/geminiClient", () => ({
  analyzeWithGemini: vi.fn(),
}));

const analyzeWithGeminiMock = vi.mocked(analyzeWithGemini);

const candidateReferences = [
  {
    id: "FC010101:SVC05:D00000815",
    name: "잎도열병",
    kind: "disease" as const,
    cropName: "벼",
    category: "병생태",
    thumbImg: null,
    detailServiceCode: "SVC05" as const,
    detailKey: "D00000815",
    sections: [{ title: "병 증상", content: "잎 반점" }],
    images: [],
  },
];

const validGeminiResponse = {
  source: "gemini",
  model: "gemini-3-flash-preview",
  fetchedAt: "2026-05-06T00:00:00.000Z",
  data: {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                candidates: [
                  {
                    candidateId: "FC010101:SVC05:D00000815",
                    name: "잎도열병",
                    confidence: "medium",
                    summary: "잎 반점이 NCPMS 후보 증상과 유사합니다.",
                    reasons: ["잎 반점"],
                    checks: ["잎 뒷면 확인"],
                  },
                ],
                checklist: ["피해 위치 기록"],
                limitations: ["사진 한계"],
                photos: [],
              }),
            },
          ],
        },
      },
    ],
  },
};

const validAppearanceResponse = {
  ...validGeminiResponse,
  data: {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                appearanceAssessment: {
                  status: "abnormal",
                  confidence: "high",
                  labels: ["변색"],
                  summary: "잎 표면에 갈색 반점과 변색이 보입니다.",
                  reasons: ["갈색 반점", "잎 표면 변색"],
                  actions: ["피해 부위를 가까이 촬영하세요."],
                },
                candidates: [],
                limitations: [],
                photos: ["피해 부위 근접 사진"],
                checklist: ["피해 범위를 확인하세요."],
              }),
            },
          ],
        },
      },
    ],
  },
};

const grapeGrayMoldReferences = [
  {
    id: "FT040603:SVC05:D00004205",
    name: "갈색무늬병",
    kind: "disease" as const,
    cropName: "포도",
    category: "병생태",
    thumbImg: null,
    detailServiceCode: "SVC05" as const,
    detailKey: "D00004205",
    sections: [{ title: "병 증상", content: "성숙된 잎에 등황색 내지 흑갈색의 병반이 형성된다." }],
    images: [],
  },
  {
    id: "FT040603:SVC05:D00004216",
    name: "잿빛곰팡이병",
    kind: "disease" as const,
    cropName: "포도",
    category: "병생태",
    thumbImg: null,
    detailServiceCode: "SVC05" as const,
    detailKey: "D00004216",
    sections: [
      {
        title: "병 증상",
        content: "성숙기의 과실에 발생이 많고 부패할 때 잿빛곰팡이가 밀생한다.",
      },
      {
        title: "발생생태",
        content: "저온, 다습한 조건에서 많이 발생한다.",
      },
    ],
    images: [],
  },
  {
    id: "FT040603:SVC05:D00004217",
    name: "큰송이썩음병",
    kind: "disease" as const,
    cropName: "포도",
    category: "병생태",
    thumbImg: null,
    detailServiceCode: "SVC05" as const,
    detailKey: "D00004217",
    sections: [{ title: "병 증상", content: "과실과 과경에 발생하고 과면 전체가 암갈색으로 변하며 부패한다." }],
    images: [],
  },
];

const grapeMoldAppearanceResponse = {
  ...validGeminiResponse,
  data: {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                appearanceAssessment: {
                  status: "abnormal",
                  confidence: "high",
                  labels: ["곰팡이 의심", "부패 의심", "변색"],
                  summary: "포도 열매 표면에 회색 솜털 형태의 곰팡이와 부패가 관찰됩니다.",
                  reasons: ["열매 표면의 회색 곰팡이", "과실 표면 부패", "갈색 변색"],
                  actions: ["피해 과실과 송이를 격리해 확인하세요."],
                },
                candidates: [],
                limitations: [],
                photos: [],
                checklist: [],
              }),
            },
          ],
        },
      },
    ],
  },
};

const emptyComparisonResponse = {
  ...validGeminiResponse,
  data: {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                appearanceAssessment: {
                  status: "abnormal",
                  confidence: "high",
                  labels: ["곰팡이 의심", "부패 의심", "변색"],
                  summary: "포도 열매 표면에 곰팡이와 부패가 관찰됩니다.",
                  reasons: ["회색 곰팡이", "부패"],
                  actions: [],
                },
                candidates: [],
                limitations: [NO_VISIBLE_SYMPTOM_EVIDENCE_LIMITATION],
                photos: [],
                checklist: [],
              }),
            },
          ],
        },
      },
    ],
  },
};

const aiFallbackSelectionResponse = {
  ...validGeminiResponse,
  data: {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                appearanceAssessment: {
                  status: "abnormal",
                  confidence: "high",
                  labels: ["곰팡이 의심", "부패 의심", "변색"],
                  summary: "포도 열매 표면에 곰팡이와 부패가 관찰됩니다.",
                  reasons: ["회색 곰팡이", "부패"],
                  actions: [],
                },
                candidates: [
                  {
                    candidateId: "FT040603:SVC05:D00004216",
                    name: "잿빛곰팡이병",
                    confidence: "medium",
                    summary: "AI가 사진의 회색 곰팡이와 NCPMS 잿빛곰팡이병 증상 설명을 비교해 가장 가까운 공식 후보로 선택했습니다.",
                    reasons: ["회색 곰팡이", "과실 부패"],
                    checks: ["과실 부패 부위에 잿빛 곰팡이가 밀생하는지 확인"],
                  },
                ],
                limitations: ["확정 진단이 아니라 AI가 고른 우선 확인 후보입니다."],
                photos: [],
                checklist: ["피해 송이 주변의 습도와 확산 여부를 확인"],
              }),
            },
          ],
        },
      },
    ],
  },
};

const appleRotReferences = [
  {
    id: "FT010601:SVC05:D00005001",
    name: "검은별무늬병",
    kind: "disease" as const,
    cropName: "사과",
    category: "병생태",
    thumbImg: null,
    detailServiceCode: "SVC05" as const,
    detailKey: "D00005001",
    sections: [{ title: "병 증상", content: "잎과 과실에 검은 반점이 형성된다." }],
    images: [],
  },
  {
    id: "FT010601:SVC05:D00005002",
    name: "갈색무늬썩음병",
    kind: "disease" as const,
    cropName: "사과",
    category: "병생태",
    thumbImg: null,
    detailServiceCode: "SVC05" as const,
    detailKey: "D00005002",
    sections: [
      {
        title: "병 증상",
        content: "과실에 갈색 병반과 부패가 발생하고 병든 부위가 썩는다.",
      },
    ],
    images: [],
  },
];

const appleRotAppearanceResponse = {
  ...validGeminiResponse,
  data: {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                appearanceAssessment: {
                  status: "abnormal",
                  confidence: "high",
                  labels: ["부패 의심", "변색", "시듦/마름"],
                  summary: "사과 열매의 한쪽 면에 갈색 변색과 부패가 보입니다.",
                  reasons: ["갈색 변색", "과실 부패", "마른 주름"],
                  actions: ["부패 부위를 가까이 촬영하세요."],
                },
                candidates: [],
                limitations: [],
                photos: [],
                checklist: [],
              }),
            },
          ],
        },
      },
    ],
  },
};

const emptyFallbackSelectionResponse = {
  ...validGeminiResponse,
  data: {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                appearanceAssessment: {
                  status: "abnormal",
                  confidence: "high",
                  labels: ["부패 의심", "변색", "시듦/마름"],
                  summary: "사과 열매에 부패와 변색이 보입니다.",
                  reasons: ["부패", "변색"],
                  actions: [],
                },
                candidates: [],
                limitations: [NO_VISIBLE_SYMPTOM_EVIDENCE_LIMITATION],
                photos: [],
                checklist: [],
              }),
            },
          ],
        },
      },
    ],
  },
};

const fruitComparisonResponse = {
  ...validGeminiResponse,
  data: {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                appearanceAssessment: {
                  status: "abnormal",
                  confidence: "high",
                  labels: ["곰팡이 의심", "부패 의심", "변색"],
                  summary: "포도 열매 표면에 곰팡이와 부패가 관찰됩니다.",
                  reasons: ["열매 표면의 회색 곰팡이", "과실 표면 부패"],
                  actions: [],
                },
                candidates: [
                  {
                    candidateId: "FT040603:SVC05:D00004216",
                    name: "잿빛곰팡이병",
                    confidence: "medium",
                    summary: "과실 부패와 잿빛 곰팡이가 NCPMS 후보 증상과 유사합니다.",
                    reasons: ["과실 부패", "회색 곰팡이"],
                    checks: ["과실 표면과 송이 주변의 곰팡이 확산 여부를 확인"],
                  },
                ],
                limitations: [],
                photos: [],
                checklist: ["피해 과실을 분리해 확인"],
              }),
            },
          ],
        },
      },
    ],
  },
};

describe("runPhotoDiagnosis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("analyzes appearance before comparing the photo with NCPMS candidates", async () => {
    analyzeWithGeminiMock
      .mockResolvedValueOnce(validAppearanceResponse)
      .mockResolvedValueOnce(validGeminiResponse);

    const result = await runPhotoDiagnosis({
      bodyPart: "잎",
      cropName: "벼",
      files: [{ mimeType: "image/jpeg", data: "base64" }],
      candidateReferences,
    });

    expect(analyzeWithGeminiMock).toHaveBeenCalledTimes(2);
    const firstPrompt = analyzeWithGeminiMock.mock.calls[0][0].contents[0].parts[0] as { text: string };
    const secondPrompt = analyzeWithGeminiMock.mock.calls[1][0].contents[0].parts[0] as { text: string };
    expect(firstPrompt.text).toContain("1차 외관");
    expect(firstPrompt.text).not.toContain("NCPMS 후보 목록");
    expect(firstPrompt.text).not.toContain("FC010101:SVC05:D00000815");
    expect(secondPrompt.text).toContain("1차 외관 분석");
    expect(secondPrompt.text).toContain("FC010101:SVC05:D00000815");
    expect(result.appearanceAssessment).toMatchObject({
      status: "abnormal",
      issueLabels: ["변색"],
    });
    expect(result.candidates[0].name).toBe("잎도열병");
  });

  it("retries once when the first Gemini appearance response is unparsable JSON", async () => {
    analyzeWithGeminiMock
      .mockResolvedValueOnce({
        ...validGeminiResponse,
        data: {
          candidates: [{ content: { parts: [{ text: "not json" }] } }],
        },
      })
      .mockResolvedValueOnce(validAppearanceResponse)
      .mockResolvedValueOnce(validGeminiResponse);

    const result = await runPhotoDiagnosis({
      bodyPart: "잎",
      cropName: "벼",
      files: [{ mimeType: "image/jpeg", data: "base64" }],
      candidateReferences,
    });

    expect(result.candidates[0].name).toBe("잎도열병");
    expect(analyzeWithGeminiMock).toHaveBeenCalledTimes(3);
    expect(analyzeWithGeminiMock.mock.calls[1][0].generationConfig?.maxOutputTokens).toBeGreaterThan(
      analyzeWithGeminiMock.mock.calls[0][0].generationConfig?.maxOutputTokens as number,
    );
  });

  it("retries when the first Gemini appearance response stops with MAX_TOKENS", async () => {
    analyzeWithGeminiMock
      .mockResolvedValueOnce({
        ...validGeminiResponse,
        data: {
          candidates: [
            {
              finishReason: "MAX_TOKENS",
              content: { parts: [{ text: "{\"candidates\":[" }] },
            },
          ],
        },
      })
      .mockResolvedValueOnce(validAppearanceResponse)
      .mockResolvedValueOnce(validGeminiResponse);

    await runPhotoDiagnosis({
      bodyPart: "잎",
      cropName: "벼",
      files: [{ mimeType: "image/jpeg", data: "base64" }],
      candidateReferences,
    });

    expect(analyzeWithGeminiMock).toHaveBeenCalledTimes(3);
  });

  it("adds NCPMS candidate IDs and list restriction rules to Gemini prompt", async () => {
    analyzeWithGeminiMock
      .mockResolvedValueOnce(validAppearanceResponse)
      .mockResolvedValueOnce(validGeminiResponse);

    await runPhotoDiagnosis({
      bodyPart: "잎",
      cropName: "벼",
      files: [{ mimeType: "image/jpeg", data: "base64" }],
      candidateReferences,
    });

    const textPart = analyzeWithGeminiMock.mock.calls[1][0].contents[0].parts[0];
    expect(textPart).toEqual({
      text: expect.stringContaining("FC010101:SVC05:D00000815"),
    });
    expect((textPart as { text: string }).text).toContain("제공된 NCPMS 후보 ID 안에서만 선택");
    expect((textPart as { text: string }).text).toContain("목록 밖 후보 금지");
    expect((textPart as { text: string }).text).toContain("병징, 변색, 벌레, 피해 흔적이 확인되지 않으면");
    expect((textPart as { text: string }).text).toContain("candidates는 빈 배열");
  });

  it("runs crop-agnostic appearance assessment even when NCPMS references are empty", async () => {
    analyzeWithGeminiMock.mockResolvedValueOnce(validAppearanceResponse);

    const result = await runPhotoDiagnosis({
      bodyPart: "잎",
      cropName: "벼",
      files: [{ mimeType: "image/jpeg", data: "base64" }],
      candidateReferences: [],
    });

    expect(analyzeWithGeminiMock).toHaveBeenCalledTimes(1);
    expect(result.candidates).toEqual([]);
    expect(result.appearanceAssessment).toMatchObject({
      status: "abnormal",
      confidenceBand: "높음",
      issueLabels: ["변색"],
    });
    expect(result.limitations).toContain("NCPMS 후보 없음. 작물명을 확인한 뒤 다시 시도하세요.");
    expect(result.recommendedPhotos).toContain("피해 부위 근접 사진");
  });

  it("filters leaf and branch-only NCPMS references out of fruit photo comparison", async () => {
    analyzeWithGeminiMock
      .mockResolvedValueOnce(grapeMoldAppearanceResponse)
      .mockResolvedValueOnce(fruitComparisonResponse);
    const onCandidateReferences = vi.fn();
    const branchOnlyReference = {
      id: "FT040603:SVC05:D00009999",
      name: "가지마름병",
      kind: "disease" as const,
      cropName: "포도",
      category: "병생태",
      thumbImg: null,
      detailServiceCode: "SVC05" as const,
      detailKey: "D00009999",
      sections: [{ title: "병 증상", content: "가지와 줄기에 갈색 궤양이 생기고 마른다." }],
      images: [],
    };
    const leafDominantMixedReference = {
      id: "FT040603:SVC05:D00008888",
      name: "노균병",
      kind: "disease" as const,
      cropName: "포도",
      category: "병생태",
      thumbImg: null,
      detailServiceCode: "SVC05" as const,
      detailKey: "D00008888",
      sections: [
        {
          title: "병 증상",
          content: "잎 표면에 담황색 병반이 생기고 잎 뒷면에는 흰 균사와 포자가 형성된다. 유과기 과실에도 드물게 발생할 수 있다.",
        },
      ],
      images: [],
    };

    const result = await runPhotoDiagnosis({
      bodyPart: "열매",
      cropName: "포도",
      files: [{ mimeType: "image/jpeg", data: "base64" }],
      candidateReferences: [...grapeGrayMoldReferences, branchOnlyReference, leafDominantMixedReference],
      onCandidateReferences,
    });

    const filteredIds = onCandidateReferences.mock.calls[0]?.[0].map((reference) => reference.id);
    expect(filteredIds).not.toContain("FT040603:SVC05:D00004205");
    expect(filteredIds).not.toContain("FT040603:SVC05:D00009999");
    expect(filteredIds).not.toContain("FT040603:SVC05:D00008888");
    expect(filteredIds).toEqual(expect.arrayContaining([
      "FT040603:SVC05:D00004216",
      "FT040603:SVC05:D00004217",
    ]));

    const comparisonPrompt = analyzeWithGeminiMock.mock.calls[1][0].contents[0].parts[0] as { text: string };
    expect(comparisonPrompt.text).toContain("FT040603:SVC05:D00004216");
    expect(comparisonPrompt.text).not.toContain("FT040603:SVC05:D00004205");
    expect(comparisonPrompt.text).not.toContain("FT040603:SVC05:D00009999");
    expect(comparisonPrompt.text).not.toContain("FT040603:SVC05:D00008888");
    expect(result.candidates[0].sourceCandidateId).toBe("FT040603:SVC05:D00004216");
  });

  it("returns appearance-only result when all NCPMS references are unrelated to the photographed fruit part", async () => {
    analyzeWithGeminiMock.mockResolvedValueOnce(grapeMoldAppearanceResponse);
    const onCandidateReferences = vi.fn();

    const result = await runPhotoDiagnosis({
      bodyPart: "열매",
      cropName: "포도",
      files: [{ mimeType: "image/jpeg", data: "base64" }],
      candidateReferences: [
        {
          id: "FT040603:SVC05:D00004205",
          name: "갈색무늬병",
          kind: "disease" as const,
          cropName: "포도",
          category: "병생태",
          thumbImg: null,
          detailServiceCode: "SVC05" as const,
          detailKey: "D00004205",
          sections: [{ title: "병 증상", content: "성숙된 잎에 등황색 내지 흑갈색의 병반이 형성된다." }],
          images: [],
        },
        {
          id: "FT040603:SVC05:D00009999",
          name: "가지마름병",
          kind: "disease" as const,
          cropName: "포도",
          category: "병생태",
          thumbImg: null,
          detailServiceCode: "SVC05" as const,
          detailKey: "D00009999",
          sections: [{ title: "병 증상", content: "가지와 줄기에 갈색 궤양이 생기고 마른다." }],
          images: [],
        },
      ],
      onCandidateReferences,
    });

    expect(analyzeWithGeminiMock).toHaveBeenCalledTimes(1);
    expect(onCandidateReferences).toHaveBeenCalledWith([]);
    expect(result.candidates).toEqual([]);
    expect(result.limitations).toContain("촬영 부위와 맞는 NCPMS 후보 없음. 촬영 부위를 확인하거나 해당 부위를 다시 촬영하세요.");
  });

  it("asks Gemini to select the closest NCPMS candidate when comparison returns no candidate", async () => {
    analyzeWithGeminiMock
      .mockResolvedValueOnce(grapeMoldAppearanceResponse)
      .mockResolvedValueOnce(emptyComparisonResponse)
      .mockResolvedValueOnce(aiFallbackSelectionResponse);

    const result = await runPhotoDiagnosis({
      bodyPart: "열매",
      cropName: "포도",
      files: [{ mimeType: "image/jpeg", data: "base64" }],
      candidateReferences: grapeGrayMoldReferences,
    });

    expect(result.candidates[0]).toMatchObject({
      sourceCandidateId: "FT040603:SVC05:D00004216",
      name: "잿빛곰팡이병",
      confidenceBand: "보통",
    });
    expect(analyzeWithGeminiMock).toHaveBeenCalledTimes(3);
    expect(result.candidates[0].summary).toContain("AI");
    expect(result.candidates[0].officialSources[0]).toMatchObject({
      sourceId: "FT040603:SVC05:D00004216",
    });
    expect(result.limitations).not.toContain(NO_VISIBLE_SYMPTOM_EVIDENCE_LIMITATION);
  });

  it("uses deterministic NCPMS text evidence when Gemini keeps returning empty candidates", async () => {
    analyzeWithGeminiMock
      .mockResolvedValueOnce(appleRotAppearanceResponse)
      .mockResolvedValueOnce(emptyComparisonResponse)
      .mockResolvedValueOnce(emptyFallbackSelectionResponse);

    const result = await runPhotoDiagnosis({
      bodyPart: "열매",
      cropName: "사과",
      files: [{ mimeType: "image/jpeg", data: "base64" }],
      candidateReferences: appleRotReferences,
    });

    expect(analyzeWithGeminiMock).toHaveBeenCalledTimes(3);
    expect(result.candidates[0]).toMatchObject({
      sourceCandidateId: "FT010601:SVC05:D00005002",
      name: "갈색무늬썩음병",
      confidenceBand: "낮음",
    });
    expect(result.candidates[0].summary).toContain("NCPMS");
    expect(result.candidates[0].officialSources[0]).toMatchObject({
      sourceId: "FT010601:SVC05:D00005002",
    });
    expect(result.limitations).not.toContain(NO_VISIBLE_SYMPTOM_EVIDENCE_LIMITATION);
  });

  it("returns a limited result instead of failing when the first Gemini step never returns parseable JSON", async () => {
    analyzeWithGeminiMock.mockResolvedValue({
      ...validGeminiResponse,
      data: {
        candidates: [{ content: { parts: [{ text: "사진만으로는 병해충 후보를 고를 수 없습니다." }] } }],
      },
    });

    const result = await runPhotoDiagnosis({
      bodyPart: "잎",
      cropName: "벼",
      files: [{ mimeType: "image/jpeg", data: "base64" }],
      candidateReferences,
    });

    expect(analyzeWithGeminiMock).toHaveBeenCalledTimes(2);
    expect(result.candidates).toEqual([]);
    expect(result.limitations).toContain(NO_VISIBLE_SYMPTOM_EVIDENCE_LIMITATION);
  });

  it("returns a limited result instead of surfacing malformed Gemini JSON syntax errors", async () => {
    analyzeWithGeminiMock.mockResolvedValue({
      ...validGeminiResponse,
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "{\"appearanceAssessment\":{\"status\":\"abnormal\",\"confidence\":\"high\",\"labels\":[\"mold\" \"rot\"],\"summary\":\"grape mold is visible\",\"reasons\":[],\"actions\":[]},\"candidates\":[],\"limitations\":[],\"photos\":[],\"checklist\":[]}",
                },
              ],
            },
          },
        ],
      },
    });

    const result = await runPhotoDiagnosis({
      bodyPart: "fruit",
      cropName: "grape",
      files: [{ mimeType: "image/jpeg", data: "base64" }],
      candidateReferences,
    });

    expect(analyzeWithGeminiMock).toHaveBeenCalledTimes(2);
    expect(result.candidates).toEqual([]);
    expect(result.limitations).toContain(NO_VISIBLE_SYMPTOM_EVIDENCE_LIMITATION);
  });
});
