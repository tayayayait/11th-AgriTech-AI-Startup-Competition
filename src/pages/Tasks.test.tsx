import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Tasks from "@/pages/Tasks";
import { getLatestWeatherRisk, getPestRisks } from "@/services/dashboardService";
import { getWeeklyFarmInfos } from "@/services/nongsaroWeeklyService";
import {
  getWorkScheduleLookupForCrop,
  getWorkSchedulesForCrop,
} from "@/services/nongsaroWorkScheduleService";
import { generateAndSaveTaskCardsForField } from "@/services/taskGenerationService";
import { getTaskCardsByField } from "@/services/taskService";
import { getWeeklyFarmBriefing } from "@/services/weeklyFarmBriefingService";
import { generateWeeklyFarmAlternativeBriefing } from "@/services/weeklyFarmAlternativeBriefingService";
import {
  getWorkVideoRecommendationsForEra,
  type WorkVideoRecommendation,
} from "@/services/nongsaroWorkVideoRecommendationService";

vi.mock("@/context/SelectedFieldContext", () => ({
  useSelectedField: () => ({
    fields: [
      {
        id: "field-1",
        name: "테스트 필지",
        crop_name: "복숭아",
        address: "충청북도 옥천군",
        lat: 36.302,
        lng: 127.571,
        growth_stage: "착과기",
        area_m2: 1200,
      },
    ],
    selected: {
      id: "field-1",
      name: "테스트 필지",
      crop_name: "복숭아",
      address: "충청북도 옥천군",
      lat: 36.302,
      lng: 127.571,
      growth_stage: "착과기",
      area_m2: 1200,
    },
    selectedId: "field-1",
    setSelectedId: vi.fn(),
  }),
}));

vi.mock("@/services/dashboardService", () => ({
  getLatestWeatherRisk: vi.fn(),
  getPestRisks: vi.fn(),
}));

vi.mock("@/services/nongsaroWeeklyService", () => ({
  getWeeklyFarmInfos: vi.fn(),
}));

vi.mock("@/services/nongsaroWorkScheduleService", () => ({
  getWorkScheduleLookupForCrop: vi.fn(),
  getWorkSchedulesForCrop: vi.fn(),
}));

vi.mock("@/services/taskGenerationService", () => ({
  generateAndSaveTaskCardsForField: vi.fn(),
}));

vi.mock("@/services/taskService", () => ({
  getTaskCardsByField: vi.fn(),
  markTaskDone: vi.fn(),
  reopenTask: vi.fn(),
  updateTaskChecks: vi.fn(),
}));

vi.mock("@/services/weeklyFarmBriefingService", () => ({
  getWeeklyFarmBriefing: vi.fn(),
  getWeeklyFarmBriefingPdfSourceUrl: vi.fn((weeklyInfo: {
    sourceUrl?: string | null;
    downUrlList?: string[];
    sourceFileName?: string | null;
  }) => {
    const sourceUrl = weeklyInfo.sourceUrl?.trim() || null;
    const candidates: string[] = [];
    for (const value of [sourceUrl, ...(weeklyInfo.downUrlList ?? [])]) {
      const trimmed = value?.trim();
      if (trimmed && !candidates.includes(trimmed)) candidates.push(trimmed);
    }
    const fileNames = (weeklyInfo.sourceFileName ?? "")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
    for (let index = 0; index < fileNames.length; index += 1) {
      if (/\.pdf$/i.test(fileNames[index]) && candidates[index]) return candidates[index];
    }
    return candidates.find((value) => /\.pdf(?:$|[?#&=])/i.test(decodeURIComponent(value))) ?? null;
  }),
}));

vi.mock("@/services/weeklyFarmAlternativeBriefingService", () => ({
  generateWeeklyFarmAlternativeBriefing: vi.fn(),
}));

vi.mock("@/services/nongsaroWorkVideoRecommendationService", () => ({
  getWorkVideoRecommendationsForEra: vi.fn(),
  filterVisibleWorkVideoRecommendations: (items: WorkVideoRecommendation[]) =>
    items.filter((item) => item.matchType !== "exclude" && item.matchScore >= 70),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

const getLatestWeatherRiskMock = vi.mocked(getLatestWeatherRisk);
const getPestRisksMock = vi.mocked(getPestRisks);
const getWeeklyFarmInfosMock = vi.mocked(getWeeklyFarmInfos);
const getWorkScheduleLookupForCropMock = vi.mocked(getWorkScheduleLookupForCrop);
const getWorkSchedulesForCropMock = vi.mocked(getWorkSchedulesForCrop);
const generateAndSaveTaskCardsForFieldMock = vi.mocked(generateAndSaveTaskCardsForField);
const getTaskCardsByFieldMock = vi.mocked(getTaskCardsByField);
const getWeeklyFarmBriefingMock = vi.mocked(getWeeklyFarmBriefing);
const generateWeeklyFarmAlternativeBriefingMock = vi.mocked(generateWeeklyFarmAlternativeBriefing);
const getWorkVideoRecommendationsForEraMock = vi.mocked(getWorkVideoRecommendationsForEra);

function renderTasks() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Tasks />
    </QueryClientProvider>,
  );
}

function mockMonthlyWorkSchedule() {
  getWorkScheduleLookupForCropMock.mockResolvedValue({
    cropName: "복숭아",
    canonicalName: "복숭아",
    matchedGroup: { cropName: "과수", groupCode: "210002", sort: 6 },
    searchedGroups: [{ cropName: "과수", groupCode: "210002", sort: 6 }],
    allScheduleCount: 19,
    matchedScheduleCount: 1,
    schedules: [
      {
        sourceId: "30662",
        title: "복숭아",
        cropName: "과수",
        groupCode: "210002",
        detailText: null,
        fileName: "복숭아 농작업일정.hwpx",
        fileUrl: "https://www.nongsaro.go.kr/peach.hwpx",
        eras: [
          {
            operationName: "봉오리따기,꽃솎기,열매솎기",
            farmWorkFlag: "열매맺음 조절",
            beginMonth: 4,
            beginEra: "상",
            endMonth: 5,
            endEra: "하",
            requiredMonth: 1,
            infoType: "생육과정(주요농작업)",
            videoUrl: null,
          },
        ],
      },
    ],
    status: "schedule-found",
  });
}

describe("Tasks weekly farm briefing", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-12T00:00:00.000+09:00"));
    vi.clearAllMocks();
    getTaskCardsByFieldMock.mockResolvedValue([]);
    getLatestWeatherRiskMock.mockResolvedValue(null);
    getPestRisksMock.mockResolvedValue([]);
    getWorkScheduleLookupForCropMock.mockResolvedValue({
      cropName: "복숭아",
      canonicalName: "복숭아",
      matchedGroup: null,
      searchedGroups: [],
      allScheduleCount: 0,
      matchedScheduleCount: 0,
      schedules: [],
      status: "schedule-match-failed",
    });
    getWorkSchedulesForCropMock.mockResolvedValue([]);
    getWeeklyFarmInfosMock.mockResolvedValue([
      {
        id: "weekly-1",
        sourceKey: "url:https://www.nongsaro.go.kr/week.pdf",
        title: "주간농사정보 제19호",
        publishedAt: "2026-05-07",
        writer: "농촌진흥청",
        periodStart: "2026-05-11",
        periodEnd: "2026-05-17",
        sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
        downUrlList: ["https://www.nongsaro.go.kr/week.pdf"],
        sourceFileName: "week.pdf",
        hitCount: null,
        summaryStatus: "pending",
        summaryText: null,
        summaryPayload: null,
        isCurrent: true,
        isNew: false,
      },
    ]);
    generateAndSaveTaskCardsForFieldMock.mockResolvedValue([]);
    generateWeeklyFarmAlternativeBriefingMock.mockResolvedValue({
      headline: "복숭아 AI 참고 농사 브리핑",
      summaryBullets: ["AI 참고: 착과기 복숭아는 열매 상태와 수분 스트레스를 우선 확인합니다."],
      actionBullets: ["열매 비대 상태와 잎 처짐 여부를 확인합니다."],
      cautionBullets: ["공식 주간농사정보 근거가 아니므로 현장 상태와 원문을 확인합니다."],
      evidenceSources: [
        {
          name: "AI 내부 지식 기반 참고(공식 주간농사정보 근거 없음)",
          url: null,
        },
      ],
    });
    getWorkVideoRecommendationsForEraMock.mockResolvedValue([]);
    getWeeklyFarmBriefingMock.mockResolvedValue({
      relevant: true,
      headline: "복숭아 주간 브리핑",
      summaryBullets: ["과수 착과량 관리 확인"],
      actionBullets: ["복숭아 열매솎기 기준 확인"],
      cautionBullets: ["원문 근거 확인"],
      evidenceSnippets: ["복숭아 열매솎기 생산기준"],
      cropName: "복숭아",
      cropGroup: "과수",
      sourceTitle: "주간농사정보 제19호",
      sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
      publishedAt: "2026-05-07",
      model: "gemini-3-flash-preview",
      fetchedAt: "2026-05-07T12:00:00.000Z",
      cacheStatus: "fresh",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates the weekly PDF briefing only after the user clicks the summary button", async () => {
    getLatestWeatherRiskMock.mockResolvedValueOnce({
      id: "weather-1",
      field_id: "field-1",
      forecast_at: "2026-05-07T07:00:00.000Z",
      collected_at: "2026-05-07T07:00:00.000Z",
      precipitation: 18,
      temperature: 25,
      wind: 4.1,
      humidity: 86,
      source_status: "connected",
      summary: "강수 18mm, 고습 86%",
    });

    renderTasks();

    await waitFor(() => {
      expect(getWeeklyFarmInfosMock).toHaveBeenCalled();
    });
    expect(getWeeklyFarmBriefingMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "해야 할 작업" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /오늘/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /이번 주/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /완료/ })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "이번주 주간농사정보 파일 요약" }));

    await waitFor(() => {
      expect(getWeeklyFarmBriefingMock).toHaveBeenCalledTimes(1);
    });
    expect(getWeeklyFarmBriefingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cropName: "복숭아",
        field: expect.objectContaining({
          id: "field-1",
          name: "테스트 필지",
          address: "충청북도 옥천군",
          lat: 36.302,
          lng: 127.571,
          growthStage: "착과기",
          areaM2: 1200,
        }),
        weather: expect.objectContaining({
          sourceStatus: "connected",
          precipitation: 18,
          temperature: 25,
          wind: 4.1,
          humidity: 86,
          riskSummary: "강수 18mm, 고습 86%",
        }),
        forceRefresh: true,
        weeklyInfo: expect.objectContaining({
          title: "주간농사정보 제19호",
          sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
        }),
      }),
    );
    expect(await screen.findByText("복숭아 주간 브리핑")).toBeInTheDocument();
  });

  it("falls back to an AI reference briefing when the current weekly document has no PDF source", async () => {
    getWeeklyFarmBriefingMock.mockResolvedValueOnce({
      relevant: false,
      headline: "복숭아 주간농사정보 PDF 분석 불가",
      summaryBullets: ["현재 주간농사정보 자료가 PDF 형식이 아니어서 원문 분석을 실행하지 못했습니다."],
      actionBullets: [],
      cautionBullets: ["공식 원문 자료를 직접 확인하고, AI 참고 브리핑은 공식 근거가 아닌 보조 판단으로만 사용하세요."],
      evidenceSnippets: [],
      cropName: "복숭아",
      cropGroup: "과수",
      sourceTitle: "주간농사정보 제27호",
      sourceUrl: "https://www.nongsaro.go.kr/week-27.hwpx",
      publishedAt: "2026-06-30",
      model: "gemini-3-flash-preview",
      fetchedAt: "2026-07-07T00:00:00.000Z",
      cacheStatus: "unavailable",
      errorCode: "unsupported_weekly_document",
    });
    getWeeklyFarmInfosMock.mockResolvedValueOnce([
      {
        id: "weekly-27",
        sourceKey: "url:https://www.nongsaro.go.kr/week-27.hwpx",
        title: "주간농사정보 제27호",
        publishedAt: "2026-06-30",
        writer: "농촌진흥청",
        periodStart: "2026-07-06",
        periodEnd: "2026-07-12",
        sourceUrl: "https://www.nongsaro.go.kr/week-27.hwpx",
        downUrlList: ["https://www.nongsaro.go.kr/week-27.hwpx"],
        sourceFileName: "week-27.hwpx",
        hitCount: null,
        summaryStatus: "pending",
        summaryText: null,
        summaryPayload: null,
        isCurrent: true,
        isNew: false,
      },
    ]);

    renderTasks();

    const button = await screen.findByRole("button", { name: "이번주 주간농사정보 파일 요약" });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    await waitFor(() => {
      expect(getWeeklyFarmBriefingMock).toHaveBeenCalledTimes(1);
    });
    expect(getWeeklyFarmBriefingMock).toHaveBeenCalledWith(expect.objectContaining({
      cropName: "복숭아",
      weeklyInfo: expect.objectContaining({
        title: "주간농사정보 제27호",
        sourceUrl: "https://www.nongsaro.go.kr/week-27.hwpx",
      }),
      forceRefresh: true,
    }));
    expect(await screen.findByText("복숭아 AI 참고 농사 브리핑")).toBeInTheDocument();
    expect(screen.getByText("현재 자료가 PDF 형식이 아니어서 원문 분석 대신 AI 참고 브리핑을 표시합니다."))
      .toBeInTheDocument();
    expect(screen.getByText("공식 PDF 근거가 없어 AI 참고로만 표시합니다.")).toBeInTheDocument();
    expect(generateWeeklyFarmAlternativeBriefingMock).toHaveBeenCalledWith(expect.objectContaining({
      cropName: "복숭아",
      field: expect.objectContaining({ growthStage: "착과기" }),
    }));
  });

  it("links the weekly evidence card directly to the PDF attachment when Nongsaro lists HWPX first", async () => {
    getWeeklyFarmInfosMock.mockResolvedValueOnce([
      {
        id: "weekly-19",
        sourceKey: "url:https://www.nongsaro.go.kr/download?ep=hwpx",
        title: "주간농사정보 제19호",
        publishedAt: "2026-05-07",
        writer: "농촌진흥청",
        periodStart: "2026-05-11",
        periodEnd: "2026-05-17",
        sourceUrl: "https://www.nongsaro.go.kr/download?ep=hwpx",
        downUrlList: [
          "https://www.nongsaro.go.kr/download?ep=hwpx",
          "https://www.nongsaro.go.kr/download?ep=hwp",
          "https://www.nongsaro.go.kr/download?ep=pdf",
        ],
        sourceFileName: "week-19.hwpx|week-19.hwp|week-19.pdf",
        hitCount: null,
        summaryStatus: "pending",
        summaryText: null,
        summaryPayload: null,
        isCurrent: true,
        isNew: false,
      },
    ]);

    renderTasks();

    const pdfLink = await screen.findByRole("link", { name: /PDF 자료 확인/ });
    expect(pdfLink).toHaveAttribute("href", "https://www.nongsaro.go.kr/download?ep=pdf");
    expect(screen.queryByRole("link", { name: /^공식 자료 확인/ })).not.toBeInTheDocument();
  });

  it("shows a stored weekly briefing again without requiring another summary click", async () => {
    getWeeklyFarmBriefingMock.mockResolvedValueOnce({
      relevant: true,
      headline: "복숭아 주간 브리핑",
      summaryBullets: ["과수 착과량 관리 확인"],
      actionBullets: ["복숭아 열매솎기 기준 확인"],
      cautionBullets: ["원문 근거 확인"],
      evidenceSnippets: ["복숭아 열매솎기 생산기준"],
      cropName: "복숭아",
      cropGroup: "과수",
      sourceTitle: "주간농사정보 제19호",
      sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
      publishedAt: "2026-05-07",
      model: "gemini-3-flash-preview",
      fetchedAt: "2026-05-07T12:00:00.000Z",
      cacheStatus: "cached",
    });
    getWeeklyFarmInfosMock.mockResolvedValueOnce([
      {
        id: "weekly-1",
        sourceKey: "url:https://www.nongsaro.go.kr/week.pdf",
        title: "주간농사정보 제19호",
        publishedAt: "2026-05-07",
        writer: "농촌진흥청",
        periodStart: "2026-05-11",
        periodEnd: "2026-05-17",
        sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
        downUrlList: ["https://www.nongsaro.go.kr/week.pdf"],
        sourceFileName: "week.pdf",
        hitCount: null,
        summaryStatus: "ready",
        summaryText: "복숭아 주간 브리핑",
        summaryPayload: {
          relevant: true,
          headline: "복숭아 주간 브리핑",
          summaryBullets: ["과수 착과량 관리 확인"],
          actionBullets: ["복숭아 열매솎기 기준 확인"],
          cautionBullets: ["원문 근거 확인"],
          evidenceSnippets: ["복숭아 열매솎기 생산기준"],
          cropName: "복숭아",
          cropGroup: "과수",
          sourceTitle: "주간농사정보 제19호",
          sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
          publishedAt: "2026-05-07",
          model: "gemini-3-flash-preview",
          fetchedAt: "2026-05-07T12:00:00.000Z",
        },
        isCurrent: true,
        isNew: false,
      },
    ]);

    renderTasks();

    await waitFor(() => {
      expect(getWeeklyFarmBriefingMock).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("복숭아 주간 브리핑")).toBeInTheDocument();
    expect(screen.queryByText("아직 생성된 브리핑이 없습니다.")).not.toBeInTheDocument();
    expect(getWeeklyFarmBriefingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        forceRefresh: false,
      }),
    );
  });

  it("forces a new weekly briefing when the user clicks summary over a stored briefing", async () => {
    getWeeklyFarmBriefingMock
      .mockResolvedValueOnce({
        relevant: true,
        headline: "저장된 복숭아 주간 브리핑",
        summaryBullets: ["저장 요약"],
        actionBullets: ["저장 확인"],
        cautionBullets: ["원문 확인"],
        evidenceSnippets: ["저장 근거"],
        cropName: "복숭아",
        cropGroup: "과수",
        sourceTitle: "주간농사정보 제19호",
        sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
        publishedAt: "2026-05-07",
        model: "gemini-3-flash-preview",
        fetchedAt: "2026-05-07T12:00:00.000Z",
        cacheStatus: "cached",
      })
      .mockResolvedValueOnce({
        relevant: true,
        headline: "새 복숭아 주간 브리핑",
        summaryBullets: ["새 요약"],
        actionBullets: ["새 확인"],
        cautionBullets: ["원문 확인"],
        evidenceSnippets: ["새 근거"],
        cropName: "복숭아",
        cropGroup: "과수",
        sourceTitle: "주간농사정보 제19호",
        sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
        publishedAt: "2026-05-07",
        model: "gemini-3-flash-preview",
        fetchedAt: "2026-05-07T13:00:00.000Z",
        cacheStatus: "fresh",
      });
    getWeeklyFarmInfosMock.mockResolvedValueOnce([
      {
        id: "weekly-1",
        sourceKey: "url:https://www.nongsaro.go.kr/week.pdf",
        title: "주간농사정보 제19호",
        publishedAt: "2026-05-07",
        writer: "농촌진흥청",
        periodStart: "2026-05-11",
        periodEnd: "2026-05-17",
        sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
        downUrlList: ["https://www.nongsaro.go.kr/week.pdf"],
        sourceFileName: "week.pdf",
        hitCount: null,
        summaryStatus: "ready",
        summaryText: "저장된 복숭아 주간 브리핑",
        summaryPayload: {
          relevant: true,
          headline: "저장된 복숭아 주간 브리핑",
          summaryBullets: ["저장 요약"],
          actionBullets: ["저장 확인"],
          cautionBullets: ["원문 확인"],
          evidenceSnippets: ["저장 근거"],
          cropName: "복숭아",
          cropGroup: "과수",
          sourceTitle: "주간농사정보 제19호",
          sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
          publishedAt: "2026-05-07",
          model: "gemini-3-flash-preview",
          fetchedAt: "2026-05-07T12:00:00.000Z",
        },
        isCurrent: true,
        isNew: false,
      },
    ]);

    renderTasks();

    await waitFor(() => {
      expect(getWeeklyFarmBriefingMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("저장된 복숭아 주간 브리핑")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "이번주 주간농사정보 파일 요약" }));

    await waitFor(() => {
      expect(getWeeklyFarmBriefingMock).toHaveBeenCalledTimes(2);
    });
    expect(getWeeklyFarmBriefingMock.mock.calls[0][0]).toMatchObject({ forceRefresh: false });
    expect(getWeeklyFarmBriefingMock.mock.calls[1][0]).toMatchObject({ forceRefresh: true });
    expect(await screen.findByText("새 복숭아 주간 브리핑")).toBeInTheDocument();
  });

  it("separates weekly task cards from farm schedule API match failures", async () => {
    const dueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    getTaskCardsByFieldMock.mockResolvedValue([
      {
        id: "weekly-task",
        field_id: "field-1",
        priority: 3,
        title: "주간농사정보 기반 작업 실행",
        reason: "복숭아 열매솎기 및 병해충 방제 확인",
        duration_min: 30,
        due_at: dueAt,
        checks: [],
        sources: [{ name: "주간농사정보 제19호", url: "https://www.nongsaro.go.kr/week.pdf" }],
        status: "pending",
        completed_at: null,
      },
    ]);
    getWorkScheduleLookupForCropMock.mockResolvedValue({
      cropName: "복숭아",
      canonicalName: "복숭아",
      matchedGroup: { cropName: "과수", groupCode: "210002", sort: 6 },
      searchedGroups: [{ cropName: "과수", groupCode: "210002", sort: 6 }],
      allScheduleCount: 2,
      matchedScheduleCount: 0,
      schedules: [],
      status: "schedule-match-failed",
    });

    renderTasks();

    expect(await screen.findByText("농작업일정 API 조회 성공 + 복숭아 목록 매칭 실패")).toBeInTheDocument();
    expect(await screen.findByText("주간농사정보 기반 작업카드 생성됨")).toBeInTheDocument();
    expect(screen.getByText("주간농사정보 기반 작업 실행")).toBeInTheDocument();
    expect(screen.queryByText("3순위")).not.toBeInTheDocument();
  });

  it("shows an AI knowledge reference briefing when weekly PDF has no direct crop content", async () => {
    getWeeklyFarmBriefingMock.mockResolvedValueOnce({
      relevant: false,
      headline: "복숭아 관련 주간농사정보 없음",
      summaryBullets: [],
      actionBullets: [],
      cautionBullets: ["원문 PDF에서 선택 작물과 직접 연결되는 문구를 확인하지 못했습니다."],
      evidenceSnippets: [],
      cropName: "복숭아",
      cropGroup: "과수",
      sourceTitle: "주간농사정보 제19호",
      sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
      publishedAt: "2026-05-07",
      model: "gemini-3-flash-preview",
      fetchedAt: "2026-05-07T12:00:00.000Z",
      cacheStatus: "fresh",
    });

    renderTasks();

    fireEvent.click(await screen.findByRole("button", { name: "이번주 주간농사정보 파일 요약" }));

    expect(await screen.findByText("복숭아 AI 참고 농사 브리핑")).toBeInTheDocument();
    expect(screen.getByText("공식 주간농사정보 근거 없음 · AI 내부 지식 기반")).toBeInTheDocument();
    expect(screen.getByText("AI 참고: 착과기 복숭아는 열매 상태와 수분 스트레스를 우선 확인합니다.")).toBeInTheDocument();
    expect(screen.getByText("열매 비대 상태와 잎 처짐 여부를 확인합니다.")).toBeInTheDocument();
    expect(screen.getByText("참고 기준 보기")).toBeInTheDocument();
    expect(generateWeeklyFarmAlternativeBriefingMock).toHaveBeenCalledWith(expect.objectContaining({
      cropName: "복숭아",
      field: expect.objectContaining({ growthStage: "착과기" }),
    }));
  });

  it("shows official farm schedule data in the monthly section without a top task card", async () => {
    const dueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    getTaskCardsByFieldMock.mockResolvedValue([
      {
        id: "schedule-task",
        field_id: "field-1",
        priority: 3,
        title: "농작업일정 실행: 봉오리따기,꽃솎기,열매솎기",
        reason: "농사로 농작업일정 기준",
        duration_min: 20,
        due_at: dueAt,
        checks: [],
        sources: [{ name: "농사로 농작업일정: 복숭아", url: "https://www.nongsaro.go.kr/peach.hwpx" }],
        status: "pending",
        completed_at: null,
      },
    ]);
    getWorkScheduleLookupForCropMock.mockResolvedValue({
      cropName: "복숭아",
      canonicalName: "복숭아",
      matchedGroup: { cropName: "과수", groupCode: "210002", sort: 6 },
      searchedGroups: [{ cropName: "과수", groupCode: "210002", sort: 6 }],
      allScheduleCount: 19,
      matchedScheduleCount: 1,
      schedules: [
        {
          sourceId: "30662",
          title: "복숭아",
          cropName: "과수",
          groupCode: "210002",
          detailText: null,
          fileName: "복숭아 농작업일정.hwpx",
          fileUrl: "https://www.nongsaro.go.kr/peach.hwpx",
          eras: [
            {
              operationName: "봉오리따기,꽃솎기,열매솎기",
              farmWorkFlag: "열매맺음 조절",
              beginMonth: 4,
              beginEra: "상",
              endMonth: 5,
              endEra: "하",
              requiredMonth: 1,
              infoType: "생육과정(주요농작업)",
              videoUrl: null,
            },
          ],
        },
      ],
      status: "schedule-found",
    });

    renderTasks();

    expect(await screen.findByText("농작업일정 API 조회 성공 + 이번 달 매칭 1건")).toBeInTheDocument();
    expect(screen.getByText("이번 달 농작업일정")).toBeInTheDocument();
    expect(screen.getByText(/농사로 농작업일정 API 기준 · KST 현재 월\(\d+월\)/)).toBeInTheDocument();
    expect(screen.getByText(/이번 달\(\d+월\) 해당 항목/)).toBeInTheDocument();
    expect(screen.getByText("봉오리따기,꽃솎기,열매솎기")).toBeInTheDocument();
    expect(screen.getByText("확인할 일")).toBeInTheDocument();
    expect(screen.getByText("첨부 자료 확인")).toBeInTheDocument();
    expect(screen.getByText("해야 할 작업 카드가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("농작업일정 실행: 봉오리따기,꽃솎기,열매솎기")).not.toBeInTheDocument();
    expect(screen.queryByText("농작업일정 API 기반 작업카드 생성됨")).not.toBeInTheDocument();
  });

  it("automatically loads selected Nongsaro videos for each monthly farm schedule work item", async () => {
    mockMonthlyWorkSchedule();
    getWorkVideoRecommendationsForEraMock.mockResolvedValueOnce([
      {
        workItem: "봉오리따기,꽃솎기,열매솎기",
        cropName: "복숭아",
        workItemTitle: "봉오리따기,꽃솎기,열매솎기",
        workItemPeriod: "4월 상-5월 하",
        videoTitle: "복숭아 꽃솎기 현장 기술",
        videoOriginInstt: "농촌진흥청",
        videoLink: "https://example.test/peach-thinning",
        videoImg: "https://example.test/peach-thinning.jpg",
        matchScore: 94,
        matchType: "direct",
        reason: "작업명과 동영상 제목이 직접 관련됩니다.",
        sourceApi: "nongsaro.cropEbook.videoList",
        judgedBy: "gemini",
        fetchedAt: "2026-05-08T00:00:00.000Z",
      },
      {
        workItem: "봉오리따기,꽃솎기,열매솎기",
        cropName: "복숭아",
        workItemTitle: "봉오리따기,꽃솎기,열매솎기",
        workItemPeriod: "4월 상-5월 하",
        videoTitle: "복숭아 개화기 관리 요령",
        videoOriginInstt: "농촌진흥청",
        videoLink: "https://example.test/peach-flowering",
        videoImg: "https://example.test/peach-flowering.jpg",
        matchScore: 78,
        matchType: "reference",
        reason: "작업 이해에 참고됩니다.",
        sourceApi: "nongsaro.cropEbook.videoList",
        judgedBy: "gemini",
        fetchedAt: "2026-05-08T00:00:00.000Z",
      },
    ]);

    renderTasks();

    await waitFor(() => {
      expect(getWorkVideoRecommendationsForEraMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldId: "field-1",
          cropName: "복숭아",
          scheduleSourceId: "30662",
          scheduleMonth: 5,
          workItem: "봉오리따기,꽃솎기,열매솎기",
          forceRefresh: false,
        }),
      );
    });
    expect(screen.queryByRole("button", { name: "관련 동영상 보기" })).not.toBeInTheDocument();
    expect(await screen.findByText("도움되는 동영상")).toBeInTheDocument();
    expect(await screen.findByText("복숭아 꽃솎기 현장 기술")).toBeInTheDocument();
    expect(screen.getByText("농촌진흥청")).toBeInTheDocument();
    expect(screen.getByText("작업명과 동영상 제목이 직접 관련됩니다.")).toBeInTheDocument();
    expect(screen.queryByText("복숭아 개화기 관리 요령")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));

    expect(await screen.findByText("복숭아 개화기 관리 요령")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /영상 보기/ })[0]).toHaveAttribute(
      "href",
      "https://example.test/peach-thinning",
    );
  });

  it("shows an empty-state message when Gemini finds no visible related video", async () => {
    mockMonthlyWorkSchedule();
    getWorkVideoRecommendationsForEraMock.mockResolvedValueOnce([
      {
        workItem: "봉오리따기,꽃솎기,열매솎기",
        cropName: "복숭아",
        workItemTitle: "봉오리따기,꽃솎기,열매솎기",
        workItemPeriod: "4월 상-5월 하",
        videoTitle: "복숭아 품종 소개",
        videoOriginInstt: "농촌진흥청",
        videoLink: "https://example.test/peach-variety",
        videoImg: null,
        matchScore: 40,
        matchType: "low",
        reason: "작목만 같습니다.",
        sourceApi: "nongsaro.cropEbook.videoList",
        judgedBy: "gemini",
        fetchedAt: "2026-05-08T00:00:00.000Z",
      },
    ]);

    renderTasks();

    expect(await screen.findByText("현재 작업과 직접 관련된 동영상은 확인되지 않았습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "관련 동영상 보기" })).not.toBeInTheDocument();
    expect(screen.queryByText("복숭아 품종 소개")).not.toBeInTheDocument();
  });

  it("keeps generated video recommendations stable without a manual refresh control", async () => {
    mockMonthlyWorkSchedule();
    getWorkVideoRecommendationsForEraMock
      .mockResolvedValueOnce([
        {
          workItem: "봉오리따기,꽃솎기,열매솎기",
          cropName: "복숭아",
          workItemTitle: "봉오리따기,꽃솎기,열매솎기",
          workItemPeriod: "4월 상-5월 하",
          videoTitle: "저장된 복숭아 꽃솎기",
          videoOriginInstt: "농촌진흥청",
          videoLink: "https://example.test/stored",
          videoImg: null,
          matchScore: 95,
          matchType: "direct",
          reason: "저장된 추천입니다.",
          sourceApi: "nongsaro.cropEbook.videoList",
          judgedBy: "gemini",
          fetchedAt: "2026-05-08T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          workItem: "봉오리따기,꽃솎기,열매솎기",
          cropName: "복숭아",
          workItemTitle: "봉오리따기,꽃솎기,열매솎기",
          workItemPeriod: "4월 상-5월 하",
          videoTitle: "새로 판정한 복숭아 꽃솎기",
          videoOriginInstt: "농촌진흥청",
          videoLink: "https://example.test/refreshed",
          videoImg: null,
          matchScore: 96,
          matchType: "direct",
          reason: "새로 판정한 추천입니다.",
          sourceApi: "nongsaro.cropEbook.videoList",
          judgedBy: "gemini",
          fetchedAt: "2026-05-08T01:00:00.000Z",
        },
      ]);

    renderTasks();

    expect(await screen.findByText("저장된 복숭아 꽃솎기")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /새로고침/ })).not.toBeInTheDocument();
    expect(getWorkVideoRecommendationsForEraMock).toHaveBeenCalledTimes(1);
  });
});
