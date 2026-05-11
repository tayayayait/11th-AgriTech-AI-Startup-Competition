import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Reports from "@/pages/Reports";
import {
  createConsultationThread,
  deleteConsultationThread,
  getConsultationContextSnapshot,
  getConsultationMessagesByThread,
  getConsultationThreadsByField,
  sendConsultationMessage,
} from "@/services/consultationService";
import { getNpmsPestImageCandidates } from "@/services/npmsPestService";
import { getPsisPesticideRegistrations } from "@/services/psisPesticideRegistrationService";
import { toast } from "sonner";

vi.mock("@/context/SelectedFieldContext", () => ({
  useSelectedField: () => ({
    selectedId: "field-1",
    selected: {
      id: "field-1",
      name: "구미 포도밭",
      crop_name: "포도",
      growth_stage: "착과기",
      address: "경상북도 구미시 옥계동",
      area_m2: 699.222,
      risk_score: 42,
      risk_level: "watch",
    },
    fields: [],
    setSelectedId: vi.fn(),
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/services/consultationService", () => ({
  createConsultationThread: vi.fn(),
  deleteConsultationThread: vi.fn(),
  getConsultationContextSnapshot: vi.fn(),
  getConsultationMessagesByThread: vi.fn(),
  getConsultationThreadsByField: vi.fn(),
  sendConsultationMessage: vi.fn(),
}));

vi.mock("@/services/reportService", () => ({
  getPesticideLookups: vi.fn(async () => []),
}));

vi.mock("@/services/nongsaroPesticideService", () => ({
  getPesticideSafetyGuides: vi.fn(async () => []),
}));

vi.mock("@/services/npmsPestService", () => ({
  getNpmsPestImageCandidates: vi.fn(async () => []),
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
    info: vi.fn(),
    success: vi.fn(),
  },
}));

const createConsultationThreadMock = vi.mocked(createConsultationThread);
const deleteConsultationThreadMock = vi.mocked(deleteConsultationThread);
const getConsultationContextSnapshotMock = vi.mocked(getConsultationContextSnapshot);
const getConsultationMessagesByThreadMock = vi.mocked(getConsultationMessagesByThread);
const getConsultationThreadsByFieldMock = vi.mocked(getConsultationThreadsByField);
const sendConsultationMessageMock = vi.mocked(sendConsultationMessage);
const getNpmsPestImageCandidatesMock = vi.mocked(getNpmsPestImageCandidates);
const getPsisPesticideRegistrationsMock = vi.mocked(getPsisPesticideRegistrations);
const toastErrorMock = vi.mocked(toast.error);

const recentThread = {
  id: "thread-new",
  fieldId: "field-1",
  title: "최근 물관리 상담",
  createdAt: "2026-05-09T04:30:00.000Z",
  updatedAt: "2026-05-09T04:50:00.000Z",
  expiresAt: "2026-06-08T04:50:00.000Z",
};

const olderThread = {
  id: "thread-old",
  fieldId: "field-1",
  title: "이전 병해 상담",
  createdAt: "2026-05-08T04:30:00.000Z",
  updatedAt: "2026-05-08T04:50:00.000Z",
  expiresAt: "2026-06-07T04:50:00.000Z",
};

function renderReports(initialEntries = ["/"]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Reports />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Reports AI consultation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConsultationThreadsByFieldMock.mockResolvedValue([recentThread, olderThread]);
    getConsultationMessagesByThreadMock.mockImplementation(async (threadId: string) => {
      if (threadId === "thread-old") {
        return [
          {
            id: "old-msg-1",
            fieldId: "field-1",
            threadId: "thread-old",
            role: "assistant",
            content: "이전 대화 답변",
            contextSnapshot: {},
            createdAt: "2026-05-08T04:51:00.000Z",
          },
        ];
      }
      return [];
    });
    createConsultationThreadMock.mockResolvedValue({
      id: "thread-created",
      fieldId: "field-1",
      title: "새 상담",
      createdAt: "2026-05-09T05:00:00.000Z",
      updatedAt: "2026-05-09T05:00:00.000Z",
      expiresAt: "2026-06-08T05:00:00.000Z",
    });
    deleteConsultationThreadMock.mockResolvedValue(undefined);
    getConsultationContextSnapshotMock.mockResolvedValue({
      generatedAt: "2026-05-09T04:00:00.000Z",
      field: {
        id: "field-1",
        name: "구미 포도밭",
        address: "경상북도 구미시 옥계동",
        cropName: "포도",
        growthStage: "착과기",
        areaM2: 699.222,
        riskScore: 42,
        riskLevel: "watch",
      },
      weather: {
        collectionCount: 2,
        averageTempC: 22,
        maxTempC: 23,
        minTempC: 21,
        averageHumidityPct: 66.5,
        totalRainMm: 2,
        maxWindMs: 4,
        latestAt: "2026-05-09T04:00:00.000Z",
      },
      weeklyBriefing: {
        title: "주간농사정보 제18호 (2026.5.4.~5.10.)",
        periodStart: "2026-05-04",
        periodEnd: "2026-05-10",
        publishedAt: "2026-05-01",
        sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
        cropName: "포도",
        cropGroup: "과수",
        headline: "포도 및 과수 개화기 물관리 기준 안내",
        summaryBullets: ["개화기 물관리를 점검합니다."],
        actionBullets: ["토양 수분을 확인합니다."],
        cautionBullets: ["과습을 피합니다."],
        evidenceSnippets: ["주간농사정보 원문 근거"],
        summaryText: "포도 및 과수 개화기 물관리 기준 안내",
        model: "gemini-3-flash-preview",
        fetchedAt: "2026-05-09T04:00:00.000Z",
      },
      diagnoses: [],
      taskSummary: { pending: 1, done: 0, inProgress: 0, deferred: 0 },
    });
    sendConsultationMessageMock.mockResolvedValue({
      answer: "현재 판단: 확실한 정보 없음",
      contextSnapshot: {} as never,
      thread: recentThread,
    });
    getPsisPesticideRegistrationsMock.mockResolvedValue({
      items: [],
      totalCount: 0,
      fetchedAt: "2026-05-11T00:00:00.000Z",
    });
    getNpmsPestImageCandidatesMock.mockResolvedValue([]);
  });

  it("상담 기록 목록과 새 채팅 버튼을 표시한다", async () => {
    renderReports();

    expect(await screen.findByText("AI 상담")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "새 채팅" })).toBeInTheDocument();
    expect(await screen.findByText("최근 물관리 상담")).toBeInTheDocument();
    expect(await screen.findByText("이전 병해 상담")).toBeInTheDocument();
    expect(screen.queryByText("상담 기록/요약")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "상담 요약 생성" })).not.toBeInTheDocument();
  });

  it("이전 상담을 선택하면 해당 스레드의 대화 기록을 조회한다", async () => {
    renderReports();

    const oldThreadButtons = await screen.findAllByRole("button", { name: /이전 병해 상담/ });
    fireEvent.click(oldThreadButtons[0]);

    expect(await screen.findByText("이전 대화 답변")).toBeInTheDocument();
    await waitFor(() => expect(getConsultationMessagesByThreadMock).toHaveBeenCalledWith("thread-old", 50));
  });

  it("새 채팅 버튼을 누르면 새 상담 스레드를 생성한다", async () => {
    renderReports();

    fireEvent.click(await screen.findByRole("button", { name: "새 채팅" }));

    await waitFor(() => expect(createConsultationThreadMock).toHaveBeenCalledWith("field-1"));
    expect(await screen.findByText("새 상담")).toBeInTheDocument();
  });

  it("상담 기록을 삭제할 수 있다", async () => {
    renderReports();

    fireEvent.click(await screen.findByRole("button", { name: "상담 삭제: 이전 병해 상담" }));

    await waitFor(() => expect(deleteConsultationThreadMock).toHaveBeenCalledWith("field-1", "thread-old"));
    await waitFor(() => expect(screen.queryByText("이전 병해 상담")).not.toBeInTheDocument());
  });

  it("질문 전송 시 현재 선택된 상담 스레드 id를 함께 보낸다", async () => {
    renderReports();

    const input = await screen.findByPlaceholderText(/현재 필지에 대해 질문하세요/);
    fireEvent.change(input, { target: { value: "오늘 물을 줘야 하나요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));

    await waitFor(() => expect(sendConsultationMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        field: expect.objectContaining({ id: "field-1" }),
        threadId: "thread-new",
        question: "오늘 물을 줘야 하나요?",
      }),
    ));
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("상담 입력창에서 Enter를 누르면 질문을 전송한다", async () => {
    renderReports();

    const input = await screen.findByPlaceholderText(/현재 필지에 대해 질문하세요/);
    fireEvent.change(input, { target: { value: "안녕" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(sendConsultationMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        field: expect.objectContaining({ id: "field-1" }),
        threadId: "thread-new",
        question: "안녕",
      }),
    ));
  });

  it("AI 답변 요청 실패 시 실패 안내를 표시한다", async () => {
    sendConsultationMessageMock.mockRejectedValue(new Error("네트워크 오류"));
    renderReports();

    const input = await screen.findByPlaceholderText(/현재 필지에 대해 질문하세요/);
    fireEvent.change(input, { target: { value: "지금 관수해도 되나요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("네트워크 오류"));
  });

  it("농약 탭에서 PSIS 등록농약 후보를 표시한다", async () => {
    getPsisPesticideRegistrationsMock.mockResolvedValueOnce({
      items: [
        {
          id: "100:7",
          pestiCode: "100",
          diseaseUseSeq: "7",
          cropName: "토마토",
          diseaseWeedName: "잿빛곰팡이병",
          useName: "살균",
          pestiKorName: "메파니피림 수화제",
          pestiBrandName: "팡파르",
          compName: "회사",
          activeIngredient: "mepanipyrim",
          manufactureType: null,
          mechanism: "라3",
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

    renderReports(["/reports?tab=pesticide&crop=토마토&target=잿빛곰팡이병"]);

    expect(await screen.findByText("농약안전정보시스템 등록농약 후보")).toBeInTheDocument();
    expect(await screen.findByText("팡파르")).toBeInTheDocument();
    expect(screen.getByText("2000배 -")).toBeInTheDocument();
    await waitFor(() => expect(getPsisPesticideRegistrationsMock).toHaveBeenCalledWith(expect.objectContaining({
      cropName: "토마토",
      targetKeyword: "잿빛곰팡이병",
    })));
  });

  it("NCPMS 공식 사진 후보를 선택하면 PSIS 조회 조건에 병해충명을 반영한다", async () => {
    getNpmsPestImageCandidatesMock.mockResolvedValueOnce([
      {
        id: "VC010803:병생태:D00004102",
        cropCode: "VC010803",
        cropName: "토마토",
        name: "궤양병",
        category: "병생태",
        thumbImg: "https://ncpms.rda.go.kr/canker.jpg",
        detailServiceCode: "SVC05",
        detailKey: "D00004102",
      },
    ]);

    renderReports(["/reports?tab=pesticide&crop=토마토"]);

    fireEvent.click(await screen.findByRole("button", { name: "공식 사진에서 고르기" }));

    expect(await screen.findByText("NCPMS 공식 사진에서 고르기")).toBeInTheDocument();
    expect(await screen.findByText("궤양병")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "이 후보로 조회" }));

    await waitFor(() => expect(getPsisPesticideRegistrationsMock).toHaveBeenCalledWith(expect.objectContaining({
      cropName: "토마토",
      targetKeyword: "궤양병",
      itemKeyword: undefined,
    })));
  });

  it("PSIS 정확 일치 결과가 없으면 등록 적용대상 후보를 다시 조회할 수 있다", async () => {
    getPsisPesticideRegistrationsMock.mockResolvedValueOnce({
      items: [],
      totalCount: 0,
      fetchedAt: "2026-05-11T00:00:00.000Z",
      targetSuggestionReason: "target_not_found",
      targetSuggestions: [
        {
          targetName: "흰빛썩음병",
          itemCount: 3,
          sampleBrands: ["메가킹", "다놀라"],
          matchedKeyword: "썩음병",
        },
      ],
    });

    renderReports(["/reports?tab=pesticide&crop=포도&target=큰송이썩음병"]);

    expect(await screen.findByText("PSIS 등록 적용대상 후보")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /흰빛썩음병/ }));

    await waitFor(() => expect(getPsisPesticideRegistrationsMock).toHaveBeenCalledWith(expect.objectContaining({
      cropName: "포도",
      targetKeyword: "흰빛썩음병",
      itemKeyword: undefined,
    })));
  });

  it("NCPMS official photo results are limited to eight numbered full items per screen", async () => {
    getNpmsPestImageCandidatesMock.mockResolvedValueOnce(
      Array.from({ length: 9 }, (_, index) => {
        const order = index + 1;
        return {
          id: `FT020604:Disease:D${String(order).padStart(8, "0")}`,
          cropCode: "FT020604",
          cropName: "Peach",
          name: `Candidate ${order}`,
          category: "Disease",
          thumbImg: `https://ncpms.rda.go.kr/candidate-${order}.jpg`,
          detailServiceCode: "SVC05" as const,
          detailKey: `D${String(order).padStart(8, "0")}`,
        };
      }),
    );

    renderReports(["/reports?tab=pesticide&crop=Peach"]);

    fireEvent.click(await screen.findByTestId("official-photo-mode-button"));

    const list = await screen.findByRole("list", { name: "NCPMS official photo candidates" });
    const items = within(list).getAllByRole("listitem");

    expect(items).toHaveLength(8);
    expect(within(items[0]).getByText("1")).toBeInTheDocument();
    expect(within(items[0]).getByText("Candidate 1")).toBeInTheDocument();
    expect(within(items[0]).getByText("FT020604")).toBeInTheDocument();
    expect(within(items[0]).getByText("SVC05")).toBeInTheDocument();
    expect(within(items[0]).getByText("D00000001")).toBeInTheDocument();
    expect(screen.queryByText("Candidate 9")).not.toBeInTheDocument();
    await waitFor(() => expect(getNpmsPestImageCandidatesMock).toHaveBeenCalledWith("Peach", 40));
  });

  it("resizes NCPMS official photo cards with Ctrl mouse wheel", async () => {
    getNpmsPestImageCandidatesMock.mockResolvedValueOnce([
      {
        id: "FT020604:Disease:D00000001",
        cropCode: "FT020604",
        cropName: "Peach",
        name: "Candidate 1",
        category: "Disease",
        thumbImg: "https://ncpms.rda.go.kr/candidate-1.jpg",
        detailServiceCode: "SVC05",
        detailKey: "D00000001",
      },
    ]);

    renderReports(["/reports?tab=pesticide&crop=Peach"]);

    fireEvent.click(await screen.findByTestId("official-photo-mode-button"));

    const list = await screen.findByRole("list", { name: "NCPMS official photo candidates" });
    expect(list).toHaveStyle({ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" });

    fireEvent.wheel(list, { ctrlKey: true, deltaY: -120 });

    expect(list).toHaveStyle({ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" });

    fireEvent.wheel(list, { ctrlKey: true, deltaY: 120 });

    expect(list).toHaveStyle({ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" });
  });
});
