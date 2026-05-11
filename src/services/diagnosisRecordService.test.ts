import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteDiagnosisRecord,
  getDiagnosisRecordHistoryByField,
  saveDiagnosisRecord,
  updateDiagnosisRecordChecklist,
} from "@/services/diagnosisRecordService";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const supabaseFromMock = vi.mocked(supabase.from);

describe("saveDiagnosisRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("sets diagnosis record expiration to 30 days after save time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-09T00:00:00.000Z"));
    const insert = vi.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: "diagnosis-1", created_at: "2026-05-09T00:00:00.000Z" }, error: null }),
      }),
    }));
    supabaseFromMock.mockReturnValue({ insert } as never);

    await saveDiagnosisRecord({
      fieldId: "field-1",
      cropName: "포도",
      bodyPart: "열매",
      firstImageName: "grape.jpg",
      checklist: [],
      result: {
        disclaimer: "확정 진단이 아닙니다.",
        appearanceAssessment: {
          status: "normal",
          confidenceBand: "보통",
          issueLabels: [],
          summary: "외관 이상 없음",
          visualReasons: [],
          recommendedActions: [],
        },
        candidates: [],
        limitations: [],
        recommendedPhotos: [],
        fieldChecklist: [],
      },
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        expires_at: "2026-06-08T00:00:00.000Z",
      }),
    );
  });

  it("persists limitations, recommended photos, checklist, and official candidate evidence", async () => {
    const insert = vi.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: "diagnosis-1" }, error: null }),
      }),
    }));
    supabaseFromMock.mockReturnValue({ insert } as never);

    const id = await saveDiagnosisRecord({
      fieldId: "field-1",
      cropName: "벼",
      bodyPart: "잎",
      firstImageName: "leaf.jpg",
      checklist: [{ label: "농사로 공식 발생정보 원문 확인", done: true }],
      result: {
        disclaimer: "확정 진단이 아닌 의심 후보입니다.",
        appearanceAssessment: {
          status: "abnormal",
          confidenceBand: "높음",
          issueLabels: ["부패 의심"],
          summary: "표면에 물러진 변색 부위가 보입니다.",
          visualReasons: ["물러짐과 변색"],
          recommendedActions: ["이상 부위를 분리하세요."],
        },
        candidates: [
          {
            name: "잎도열병",
            confidenceBand: "보통",
            visualReasons: ["잎 반점"],
            weatherReasons: [],
            nextChecks: ["잎 뒷면 확인"],
            officialSources: [
              {
                sourceId: "src-1",
                title: "벼 잎도열병 발생정보",
                publishedAt: "2026-05-01",
                attachmentUrl: "https://example.test/leaf.pdf",
                matchReason: "후보명 직접 일치",
              },
            ],
          },
        ],
        limitations: ["사진 한계"],
        recommendedPhotos: ["잎 뒷면"],
        fieldChecklist: ["농사로 공식 발생정보 원문 확인"],
      },
    });

    expect(id).toBe("diagnosis-1");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance_assessment: expect.objectContaining({
          status: "abnormal",
          issueLabels: ["부패 의심"],
        }),
        limitations: ["사진 한계"],
        recommended_photos: ["잎 뒷면"],
        checklist: [{ label: "농사로 공식 발생정보 원문 확인", done: true }],
        candidates: [
          expect.objectContaining({
            name: "잎도열병",
            officialSources: [
              expect.objectContaining({
                title: "벼 잎도열병 발생정보",
                matchReason: "후보명 직접 일치",
              }),
            ],
          }),
        ],
      }),
    );
  });

  it("persists the review image, field snapshot, and full analysis result for later review", async () => {
    const insert = vi.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: "diagnosis-1", created_at: "2026-05-09T00:00:00.000Z" }, error: null }),
      }),
    }));
    supabaseFromMock.mockReturnValue({ insert } as never);

    const result = {
      disclaimer: "AI diagnosis disclaimer",
      appearanceAssessment: {
        status: "abnormal",
        confidenceBand: "high",
        issueLabels: ["mold"],
        summary: "Visible mold was found.",
        visualReasons: ["gray fuzzy growth"],
        recommendedActions: ["separate damaged fruit"],
      },
      candidates: [],
      limitations: [],
      recommendedPhotos: [],
      fieldChecklist: [],
    } as never;
    const references = [
      {
        id: "candidate-1",
        name: "gray mold",
        kind: "disease",
        cropName: "grape",
        category: "fruit",
        thumbImg: "https://example.test/thumb.jpg",
        detailServiceCode: "SVC05",
        detailKey: "detail-1",
        sections: [{ title: "Symptoms", content: "Gray fuzzy growth." }],
        images: [{ url: "https://example.test/detail.jpg", title: "gray mold fruit", category: "fruit" }],
      },
    ];

    await saveDiagnosisRecord({
      fieldId: "field-1",
      cropName: "grape",
      bodyPart: "fruit",
      firstImageName: "grape.jpg",
      firstImageDataUrl: "data:image/jpeg;base64,ZmFrZQ==",
      fieldSnapshot: {
        id: "field-1",
        name: "Gumi grape field",
        cropName: "grape",
        address: "Gumi",
      },
      checklist: [],
      result,
      references: references as never,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        image_url: "data:image/jpeg;base64,ZmFrZQ==",
        image_name: "grape.jpg",
        field_snapshot: {
          id: "field-1",
          name: "Gumi grape field",
          cropName: "grape",
          address: "Gumi",
        },
        analysis_result: expect.objectContaining({
          npmsReferences: references,
        }),
      }),
    );
  });

  it("updates checklist on an existing diagnosis record without inserting a duplicate", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    supabaseFromMock.mockReturnValue({ update } as never);

    await updateDiagnosisRecordChecklist("diagnosis-1", [
      { label: "피해 과실 사진 기록", done: true },
    ]);

    expect(supabaseFromMock).toHaveBeenCalledWith("diagnosis_records");
    expect(update).toHaveBeenCalledWith({
      checklist: [{ label: "피해 과실 사진 기록", done: true }],
    });
    expect(eq).toHaveBeenCalledWith("id", "diagnosis-1");
  });
});

describe("getDiagnosisRecordHistoryByField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns non-expired diagnosis history with image, field snapshot, and analysis result", async () => {
    const limit = vi.fn(async () => ({
      data: [
        {
          id: "diagnosis-1",
          created_at: "2026-05-09T01:02:03.000Z",
          expires_at: "2026-06-08T01:02:03.000Z",
          field_id: "field-1",
          crop_name: "grape",
          body_part: "fruit",
          image_url: "data:image/jpeg;base64,ZmFrZQ==",
          image_name: "grape.jpg",
          field_snapshot: { id: "field-1", name: "Gumi grape field", cropName: "grape" },
          analysis_result: {
            disclaimer: "AI diagnosis disclaimer",
            appearanceAssessment: {
              status: "abnormal",
              confidenceBand: "high",
              issueLabels: ["mold"],
              summary: "Visible mold was found.",
              visualReasons: ["gray fuzzy growth"],
              recommendedActions: ["separate damaged fruit"],
            },
            candidates: [],
            limitations: [],
            recommendedPhotos: [],
            fieldChecklist: [],
            npmsReferences: [
              {
                id: "candidate-1",
                name: "gray mold",
                kind: "disease",
                cropName: "grape",
                category: "fruit",
                thumbImg: "https://example.test/thumb.jpg",
                detailServiceCode: "SVC05",
                detailKey: "detail-1",
                sections: [{ title: "Symptoms", content: "Gray fuzzy growth." }],
                images: [{ url: "https://example.test/detail.jpg", title: "gray mold fruit", category: "fruit" }],
              },
            ],
          },
          confidence_band: "medium",
          appearance_assessment: {},
          candidates: [],
          checklist: [],
          limitations: [],
          recommended_photos: [],
          status: "completed",
        },
      ],
      error: null,
    }));
    const order = vi.fn(() => ({ limit }));
    const gt = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ gt }));
    const select = vi.fn(() => ({ eq }));
    supabaseFromMock.mockReturnValue({ select } as never);

    const records = await getDiagnosisRecordHistoryByField("field-1", 10);

    expect(records).toEqual([
      expect.objectContaining({
        id: "diagnosis-1",
        imageUrl: "data:image/jpeg;base64,ZmFrZQ==",
        imageName: "grape.jpg",
        fieldSnapshot: expect.objectContaining({ name: "Gumi grape field" }),
        result: expect.objectContaining({
          appearanceAssessment: expect.objectContaining({ summary: "Visible mold was found." }),
        }),
        references: [
          expect.objectContaining({
            id: "candidate-1",
            sections: [{ title: "Symptoms", content: "Gray fuzzy growth." }],
          }),
        ],
      }),
    ]);
    expect(supabaseFromMock).toHaveBeenCalledWith("diagnosis_records");
    expect(eq).toHaveBeenCalledWith("field_id", "field-1");
    expect(gt).toHaveBeenCalledWith("expires_at", expect.any(String));
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(10);
  });
});

describe("deleteDiagnosisRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes only the requested diagnosis record", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const deleteRecord = vi.fn(() => ({ eq }));
    supabaseFromMock.mockReturnValue({ delete: deleteRecord } as never);

    await deleteDiagnosisRecord("diagnosis-1");

    expect(supabaseFromMock).toHaveBeenCalledWith("diagnosis_records");
    expect(deleteRecord).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "diagnosis-1");
  });
});
