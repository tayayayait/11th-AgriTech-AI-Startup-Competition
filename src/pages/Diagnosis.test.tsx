import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MARKETABILITY_CHECK_GUIDANCE, NO_VISIBLE_SYMPTOM_LIMITATION } from "@/domain/ai/diagnosis";
import Diagnosis from "@/pages/Diagnosis";
import { deleteDiagnosisRecord, getDiagnosisRecordHistoryByField, saveDiagnosisRecord } from "@/services/diagnosisRecordService";
import { runPhotoDiagnosis } from "@/services/diagnosisService";
import type { NpmsDiagnosisReference } from "@/services/npmsPestService";
import { getPsisPesticideRegistrations } from "@/services/psisPesticideRegistrationService";
import { toast } from "sonner";

vi.mock("@/context/SelectedFieldContext", () => ({
  useSelectedField: () => ({
    fields: [
      {
        id: "field-1",
        name: "경상북도 구미시 옥계동 밭",
        crop_name: "사과",
      },
    ],
    selected: {
      id: "field-1",
      name: "경상북도 구미시 옥계동 밭",
      crop_name: "사과",
    },
    selectedId: "field-1",
    setSelectedId: vi.fn(),
  }),
}));

vi.mock("@/services/diagnosisRecordService", () => ({
  deleteDiagnosisRecord: vi.fn(),
  getDiagnosisRecordHistoryByField: vi.fn(),
  saveDiagnosisRecord: vi.fn(),
  updateDiagnosisRecordChecklist: vi.fn(),
}));

vi.mock("@/services/diagnosisService", () => ({
  runPhotoDiagnosis: vi.fn(),
}));

vi.mock("@/services/psisPesticideRegistrationService", () => ({
  getPsisPesticideRegistrations: vi.fn(async () => ({
    items: [],
    totalCount: 0,
    fetchedAt: "2026-05-11T00:00:00.000Z",
  })),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const runPhotoDiagnosisMock = vi.mocked(runPhotoDiagnosis);
const deleteDiagnosisRecordMock = vi.mocked(deleteDiagnosisRecord);
const getDiagnosisRecordHistoryByFieldMock = vi.mocked(getDiagnosisRecordHistoryByField);
const saveDiagnosisRecordMock = vi.mocked(saveDiagnosisRecord);
const getPsisPesticideRegistrationsMock = vi.mocked(getPsisPesticideRegistrations);

class LowResolutionImage {
  naturalWidth = 640;
  naturalHeight = 640;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    window.setTimeout(() => this.onload?.(), 0);
  }
}

describe("Diagnosis upload warnings", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    deleteDiagnosisRecordMock.mockResolvedValue(undefined);
    getDiagnosisRecordHistoryByFieldMock.mockResolvedValue([]);
    saveDiagnosisRecordMock.mockResolvedValue("diagnosis-record-1");
    getPsisPesticideRegistrationsMock.mockResolvedValue({
      items: [],
      totalCount: 0,
      fetchedAt: "2026-05-11T00:00:00.000Z",
    });
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.stubGlobal("Image", LowResolutionImage);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:diagnosis-test"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("shows low-resolution guidance inline without a duplicate toast", async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Diagnosis />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("file input not found");

    const file = new File(["image"], "small-apple.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/사진이 작아 판독 정확도가 낮을 수 있습니다/)).toBeInTheDocument();
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("shows a separate no-symptom result instead of a destructive limited panel", async () => {
    runPhotoDiagnosisMock.mockResolvedValueOnce({
      disclaimer: "사진과 NCPMS 도감정보를 비교한 의심 후보이며 확정 진단/처방이 아닙니다.",
      appearanceAssessment: {
        status: "normal",
        confidenceBand: "보통",
        issueLabels: [],
        summary: "사진상 뚜렷한 외관 이상은 확인되지 않았습니다.",
        visualReasons: [],
        recommendedActions: [],
      },
      candidates: [],
      limitations: [NO_VISIBLE_SYMPTOM_LIMITATION],
      recommendedPhotos: [],
      fieldChecklist: [MARKETABILITY_CHECK_GUIDANCE],
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Diagnosis />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("file input not found");

    const file = new File(["image"], "fresh-apple.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("fresh-apple.jpg")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "사진 분석 시작" }));

    await waitFor(() => {
      expect(screen.getByText("NCPMS 병해충 후보와 명확히 연결되지 않음")).toBeInTheDocument();
    });
    expect(screen.getByText("NCPMS 후보 없음")).toBeInTheDocument();
    expect(screen.getAllByText(MARKETABILITY_CHECK_GUIDANCE).length).toBeGreaterThan(0);
    expect(screen.queryByText("판독 제한 사유")).not.toBeInTheDocument();
  });

  it("shows crop-agnostic appearance issues separately from NCPMS no-match state", async () => {
    runPhotoDiagnosisMock.mockResolvedValueOnce({
      disclaimer: "사진과 NCPMS 도감정보를 비교한 의심 후보이며 확정 진단/처방이 아닙니다.",
      appearanceAssessment: {
        status: "abnormal",
        confidenceBand: "높음",
        issueLabels: ["부패 의심", "곰팡이 의심"],
        summary: "표면에 회백색 부착물과 물러진 변색 부위가 보입니다.",
        visualReasons: ["표면 부착물", "갈변과 물러짐"],
        recommendedActions: ["이상 부위를 분리하고 선별 기준을 확인하세요."],
      },
      candidates: [],
      limitations: [NO_VISIBLE_SYMPTOM_LIMITATION],
      recommendedPhotos: ["이상 부위 근접 사진"],
      fieldChecklist: [MARKETABILITY_CHECK_GUIDANCE],
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Diagnosis />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("file input not found");

    const file = new File(["image"], "damaged-crop.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("damaged-crop.jpg")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "사진 분석 시작" }));

    await waitFor(() => {
      expect(screen.getByText("외관상 이상 소견")).toBeInTheDocument();
    });
    expect(screen.getByText("외관 이상")).toBeInTheDocument();
    expect(screen.getByText("부패 의심")).toBeInTheDocument();
    expect(screen.getByText("곰팡이 의심")).toBeInTheDocument();
    expect(screen.getByText("NCPMS 병해충 후보와 명확히 연결되지 않음")).toBeInTheDocument();
    expect(screen.queryByText("사진상 뚜렷한 병징 없음")).not.toBeInTheDocument();
  });

  it("automatically saves a separate diagnosis record when photo analysis completes", async () => {
    runPhotoDiagnosisMock.mockResolvedValueOnce({
      disclaimer: "사진과 NCPMS 공개정보를 비교한 의심 후보이며 확정 진단/처방이 아닙니다.",
      appearanceAssessment: {
        status: "abnormal",
        confidenceBand: "보통",
        issueLabels: ["곰팡이"],
        summary: "포도 과실 표면에 곰팡이가 보입니다.",
        visualReasons: ["회색 곰팡이"],
        recommendedActions: ["피해 과실을 확인하세요."],
      },
      candidates: [],
      limitations: [],
      recommendedPhotos: [],
      fieldChecklist: ["피해 과실 사진 기록"],
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Diagnosis />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("file input not found");

    const file = new File(["image"], "auto-save-grape.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("auto-save-grape.jpg")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "사진 분석 시작" }));

    await waitFor(() => {
      expect(saveDiagnosisRecordMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldId: "field-1",
          cropName: "사과",
          firstImageName: "auto-save-grape.jpg",
          firstImageDataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
          fieldSnapshot: expect.objectContaining({
            id: "field-1",
          }),
          checklist: [{ label: "피해 과실 사진 기록", done: false }],
        }),
      );
    });
    expect(screen.getByText("기록 ID: diagnosis-record-1")).toBeInTheDocument();
  });

  it("shows saved diagnosis history with the stored image and analysis summary", async () => {
    getDiagnosisRecordHistoryByFieldMock.mockResolvedValueOnce([
      {
        id: "diagnosis-1",
        createdAt: "2026-05-09T01:02:03.000Z",
        expiresAt: "2026-06-08T01:02:03.000Z",
        cropName: "grape",
        bodyPart: "fruit",
        imageUrl: "data:image/jpeg;base64,ZmFrZQ==",
        imageName: "saved-grape.jpg",
        confidenceBand: "medium",
        fieldSnapshot: {
          id: "field-1",
          name: "Gumi grape field",
          cropName: "grape",
        },
        result: {
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
        },
        candidates: [],
        checklist: [],
      } as never,
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Diagnosis />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(getDiagnosisRecordHistoryByFieldMock).toHaveBeenCalledWith("field-1", 12);
    });

    expect(screen.getByText("저장된 사진 판독 기록")).toBeInTheDocument();
    expect(screen.getByAltText("saved-grape.jpg")).toHaveAttribute("src", "data:image/jpeg;base64,ZmFrZQ==");
    expect(screen.getByText("Gumi grape field")).toBeInTheDocument();
    expect(screen.getByText("Visible mold was found.")).toBeInTheDocument();
  });

  it("opens saved diagnosis history details when a history item is clicked", async () => {
    getDiagnosisRecordHistoryByFieldMock.mockResolvedValueOnce([
      {
        id: "diagnosis-1",
        createdAt: "2026-05-09T01:02:03.000Z",
        expiresAt: "2026-06-08T01:02:03.000Z",
        cropName: "grape",
        bodyPart: "fruit",
        imageUrl: "data:image/jpeg;base64,ZmFrZQ==",
        imageName: "saved-grape.jpg",
        confidenceBand: "medium",
        fieldSnapshot: {
          id: "field-1",
          name: "Gumi grape field",
          cropName: "grape",
        },
        result: {
          disclaimer: "AI diagnosis disclaimer",
          appearanceAssessment: {
            status: "abnormal",
            confidenceBand: "high",
            issueLabels: ["mold"],
            summary: "Visible mold was found.",
            visualReasons: ["gray fuzzy growth"],
            recommendedActions: ["separate damaged fruit"],
          },
          candidates: [
            {
              sourceCandidateId: "candidate-1",
              name: "gray mold",
              confidenceBand: "medium",
              summary: "Candidate detail summary.",
              visualReasons: ["mold starts from the fruit surface"],
              weatherReasons: ["humid weather continued"],
              nextChecks: ["Stem lesions should be checked."],
              officialSources: [],
            },
          ],
          limitations: ["Photo focus is weak."],
          recommendedPhotos: ["Capture a close-up fruit photo."],
          fieldChecklist: [],
        },
        candidates: [
          {
            sourceCandidateId: "candidate-1",
            name: "gray mold",
            confidenceBand: "medium",
            summary: "Candidate detail summary.",
            visualReasons: ["mold starts from the fruit surface"],
            weatherReasons: ["humid weather continued"],
            nextChecks: ["Stem lesions should be checked."],
            officialSources: [],
          },
        ],
        references: [
          {
            id: "candidate-1",
            name: "gray mold",
            kind: "disease",
            cropName: "grape",
            category: "disease ecology",
            thumbImg: null,
            detailServiceCode: "SVC05",
            detailKey: "candidate-1",
            sections: [{ title: "방제방법", content: "Remove damaged fruit.\nImprove airflow." }],
            images: [
              {
                url: "https://ncpms.example/gray-mold.jpg",
                title: "Gray mold symptom",
                category: "symptom",
              },
            ],
          } satisfies NpmsDiagnosisReference,
        ],
        checklist: [{ label: "Inspect neighboring fruit.", done: true }],
      } as never,
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Diagnosis />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Gumi grape field")).toBeInTheDocument();
    });

    expect(screen.queryByText("Stem lesions should be checked.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gumi grape field 판독 기록 상세 보기" }));

    expect(screen.getByText("사진 판독 결과")).toBeVisible();
    expect(screen.getByAltText("Gray mold symptom")).toHaveAttribute("src", "https://ncpms.example/gray-mold.jpg");
    expect(screen.getByText("NCPMS 제공 작업")).toBeVisible();
    expect(screen.getAllByText("방제방법").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Improve airflow.").length).toBeGreaterThan(0);
    expect(screen.getByText("NCPMS 근거 보기")).toBeVisible();
    expect(screen.queryByText("NCPMS 의심 후보")).not.toBeInTheDocument();
    expect(screen.getAllByText("현장 체크리스트").length).toBeGreaterThan(1);
    expect(screen.getByText("Stem lesions should be checked.")).toBeVisible();
    expect(screen.getByText(/Photo focus is weak/)).toBeVisible();
    expect(screen.getByText("Inspect neighboring fruit.")).toBeVisible();
  });

  it("prioritizes NCPMS official images that match the diagnosed plant part", async () => {
    getDiagnosisRecordHistoryByFieldMock.mockResolvedValueOnce([
      {
        id: "diagnosis-1",
        createdAt: "2026-05-09T01:02:03.000Z",
        expiresAt: "2026-06-08T01:02:03.000Z",
        cropName: "apple",
        bodyPart: "fruit",
        imageUrl: "data:image/jpeg;base64,ZmFrZQ==",
        imageName: "saved-apple.jpg",
        confidenceBand: "low",
        fieldSnapshot: {
          id: "field-1",
          name: "Gumi apple field",
          cropName: "apple",
        },
        result: {
          disclaimer: "AI diagnosis disclaimer",
          appearanceAssessment: {
            status: "abnormal",
            confidenceBand: "low",
            issueLabels: ["rot", "brown discoloration"],
            summary: "Internal fruit rot is visible.",
            visualReasons: ["brown fruit flesh"],
            recommendedActions: ["compare the damaged fruit section"],
          },
          candidates: [
            {
              sourceCandidateId: "candidate-1",
              name: "white rot",
              confidenceBand: "low",
              summary: "Candidate text overlaps with fruit rot symptoms.",
              visualReasons: ["fruit rot", "brown discoloration"],
              weatherReasons: [],
              nextChecks: ["Compare the fruit lesion with NCPMS fruit photos."],
              officialSources: [],
            },
          ],
          limitations: [],
          recommendedPhotos: [],
          fieldChecklist: [],
        },
        candidates: [
          {
            sourceCandidateId: "candidate-1",
            name: "white rot",
            confidenceBand: "low",
            summary: "Candidate text overlaps with fruit rot symptoms.",
            visualReasons: ["fruit rot", "brown discoloration"],
            weatherReasons: [],
            nextChecks: ["Compare the fruit lesion with NCPMS fruit photos."],
            officialSources: [],
          },
        ],
        references: [
          {
            id: "candidate-1",
            name: "white rot",
            kind: "disease",
            cropName: "apple",
            category: "disease ecology",
            thumbImg: null,
            detailServiceCode: "SVC05",
            detailKey: "candidate-1",
            sections: [{ title: "병 증상", content: "fruit rot and brown discoloration" }],
            images: [
              {
                url: "https://ncpms.example/stem.jpg",
                title: "white rot stem canker",
                category: "stem",
              },
              {
                url: "https://ncpms.example/fruit.jpg",
                title: "white rot fruit symptom",
                category: "fruit symptom",
              },
            ],
          } satisfies NpmsDiagnosisReference,
        ],
        checklist: [],
      } as never,
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Diagnosis />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Gumi apple field")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Gumi apple field 판독 기록 상세 보기" }));

    expect(screen.getByAltText("white rot fruit symptom")).toHaveAttribute(
      "src",
      "https://ncpms.example/fruit.jpg",
    );
    expect(screen.queryByAltText("white rot stem canker")).not.toBeInTheDocument();
  });

  it("deletes a saved diagnosis history item when the trash button is clicked", async () => {
    getDiagnosisRecordHistoryByFieldMock.mockResolvedValueOnce([
      {
        id: "diagnosis-1",
        createdAt: "2026-05-09T01:02:03.000Z",
        expiresAt: "2026-06-08T01:02:03.000Z",
        cropName: "grape",
        bodyPart: "fruit",
        imageUrl: "data:image/jpeg;base64,ZmFrZQ==",
        imageName: "saved-grape.jpg",
        confidenceBand: "medium",
        fieldSnapshot: {
          id: "field-1",
          name: "Gumi grape field",
          cropName: "grape",
        },
        result: {
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
        },
        candidates: [],
        checklist: [],
      } as never,
    ]).mockResolvedValueOnce([]);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Diagnosis />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Gumi grape field")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "판독 기록 삭제" }));

    await waitFor(() => {
      expect(deleteDiagnosisRecordMock).toHaveBeenCalledWith("diagnosis-1");
    });
    await waitFor(() => {
      expect(getDiagnosisRecordHistoryByFieldMock).toHaveBeenCalledTimes(2);
    });
    expect(toast.success).toHaveBeenCalledWith("사진 판독 기록을 삭제했습니다.");
  });

  it("shows NCPMS official images and action sections for matched candidates", async () => {
    getPsisPesticideRegistrationsMock.mockResolvedValueOnce({
      items: [
        {
          id: "100:7",
          pestiCode: "100",
          diseaseUseSeq: "7",
          cropName: "사과",
          diseaseWeedName: "잿빛곰팡이병",
          useName: "살균",
          pestiKorName: "메파니피림 수화제",
          pestiBrandName: "팡파르",
          compName: "회사",
          activeIngredient: "mepanipyrim",
          manufactureType: null,
          mechanism: null,
          firstRegisteredAt: null,
          cropCode: null,
          cropGroupCode: null,
          cropGroupName: null,
          useMethod: "발병 초부터 경엽처리",
          dilution: "2000배 -",
          preHarvestInterval: "수확7일전",
          maxUseCount: "3회",
          preHarvestDays: 7,
          maxUses: 3,
        },
      ],
      totalCount: 1,
      fetchedAt: "2026-05-11T00:00:00.000Z",
    });

    const npmsReference = {
      id: "FT040603:SVC05:D00004216",
      name: "잿빛곰팡이병",
      kind: "disease",
      cropName: "포도",
      category: "병생태",
      thumbImg: "https://ncpms.rda.go.kr/thumb.jpg",
      detailServiceCode: "SVC05",
      detailKey: "D00004216",
      sections: [
        { title: "병 증상", content: "과실에 잿빛 곰팡이가 밀생한다." },
        { title: "방제방법", content: "병든 과실을 제거한다.\n통풍 상태를 개선한다." },
      ],
      images: [
        {
          url: "https://ncpms.rda.go.kr/detail-gray-mold.jpg",
          title: "포도 잿빛곰팡이병 증상",
          category: "증상",
        },
      ],
    } satisfies NpmsDiagnosisReference;

    runPhotoDiagnosisMock.mockImplementationOnce(async (input) => {
      input.onCandidateReferences?.([npmsReference]);

      return {
        disclaimer: "사진과 NCPMS 공개정보를 비교한 의심 후보이며 확정 진단/처방이 아닙니다.",
        appearanceAssessment: {
          status: "abnormal",
          confidenceBand: "보통",
          issueLabels: ["곰팡이"],
          summary: "포도 과실 표면에 곰팡이가 보입니다.",
          visualReasons: ["회색 곰팡이"],
          recommendedActions: ["피해 과실을 확인하세요."],
        },
        candidates: [
          {
            sourceCandidateId: "FT040603:SVC05:D00004216",
            name: "잿빛곰팡이병",
            confidenceBand: "보통",
            summary: "사진상 양상이 NCPMS 후보와 유사합니다.",
            visualReasons: ["과실 표면 곰팡이"],
            weatherReasons: [],
            nextChecks: ["곰팡이 색상과 부패 범위를 확인"],
            officialSources: [],
          },
        ],
        limitations: [],
        recommendedPhotos: [],
        fieldChecklist: ["피해 과실 사진 기록"],
      };
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Diagnosis />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("file input not found");

    const file = new File(["image"], "grape-gray-mold.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("grape-gray-mold.jpg")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "사진 분석 시작" }));

    await waitFor(() => {
      expect(screen.getByText("NCPMS 제공 작업")).toBeInTheDocument();
    });
    expect(screen.getByText("병든 과실을 제거한다.")).toBeInTheDocument();
    expect(screen.getByText("통풍 상태를 개선한다.")).toBeInTheDocument();
    const officialImage = screen.getByAltText("포도 잿빛곰팡이병 증상");
    expect(officialImage).toHaveAttribute(
      "src",
      "https://ncpms.rda.go.kr/detail-gray-mold.jpg",
    );
    expect(officialImage).toHaveClass("object-contain");
    const pesticideGuideLink = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href")?.startsWith("/reports?"));
    expect(pesticideGuideLink).toHaveAttribute("href", expect.stringContaining("tab=pesticide"));
    expect(pesticideGuideLink).toHaveAttribute("href", expect.stringContaining("crop="));
    expect(pesticideGuideLink).toHaveAttribute("href", expect.stringContaining("target="));
    await waitFor(() => {
      expect(saveDiagnosisRecordMock).toHaveBeenCalledWith(
        expect.objectContaining({
          references: [npmsReference],
        }),
      );
    });
  });
});
