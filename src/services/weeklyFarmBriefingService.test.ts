import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeApiAdapter } from "@/services/api/edgeAdapter";
import {
  getWeeklyFarmBriefing,
  parseWeeklyFarmBriefingFromGeminiResponse,
  WEEKLY_BRIEFING_MODEL,
} from "@/services/weeklyFarmBriefingService";
import type { NongsaroWeeklyInfo } from "@/services/nongsaroWeeklyService";

const weeklySummaryStore = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  missingTable: false,
}));

vi.mock("@/services/api/edgeAdapter", () => ({
  invokeApiAdapter: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((tableName: string) => {
      if (tableName !== "weekly_farm_infos") throw new Error(`Unexpected table: ${tableName}`);

      return {
        select: vi.fn(() => {
          let sourceKey = "";
          const builder = {
            eq: vi.fn((_column: string, value: string) => {
              sourceKey = value;
              return builder;
            }),
            maybeSingle: vi.fn(async () => ({
              data: weeklySummaryStore.missingTable ? null : weeklySummaryStore.rows.get(sourceKey) ?? null,
              error: weeklySummaryStore.missingTable
                ? { status: 404, code: "PGRST205", message: "weekly_farm_infos missing" }
                : null,
            })),
          };
          return builder;
        }),
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn(async (_column: string, sourceKey: string) => {
            if (weeklySummaryStore.missingTable) {
              return { error: { status: 404, code: "PGRST205", message: "weekly_farm_infos missing" } };
            }
            weeklySummaryStore.rows.set(sourceKey, {
              ...(weeklySummaryStore.rows.get(sourceKey) ?? {}),
              ...payload,
            });
            return { error: null };
          }),
        })),
      };
    }),
  },
}));

function weeklyInfo(overrides: Partial<NongsaroWeeklyInfo> = {}): NongsaroWeeklyInfo {
  return {
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
    ...overrides,
  };
}

describe("weekly farm briefing service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invokeApiAdapter).mockReset();
    window.localStorage.clear();
    weeklySummaryStore.rows.clear();
    weeklySummaryStore.missingTable = false;
  });

  it("parses Gemini JSON from generateContent candidates", () => {
    const parsed = parseWeeklyFarmBriefingFromGeminiResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  relevant: true,
                  headline: "과수 주간 관리 요약",
                  summaryBullets: ["포도 착과량 관리가 중요합니다."],
                  actionBullets: ["포도 송이 수를 확인합니다."],
                  cautionBullets: ["PDF에 없는 방제 지시는 추가하지 않았습니다."],
                  evidenceSnippets: ["포도 캠벨얼리 생산기준"],
                }),
              },
            ],
          },
        },
      ],
    });

    expect(parsed).toEqual({
      relevant: true,
      headline: "과수 주간 관리 요약",
      summaryBullets: ["포도 착과량 관리가 중요합니다."],
      actionBullets: ["포도 송이 수를 확인합니다."],
      cautionBullets: ["PDF에 없는 방제 지시는 추가하지 않았습니다."],
      weatherBullets: [],
      pestRiskBullets: [],
      irrigationBullets: [],
      growthManagementBullets: [],
      evidenceSnippets: ["포도 캠벨얼리 생산기준"],
    });
  });

  it("requests weekly PDF briefing with the selected Gemini model and crop group", async () => {
    const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);
    invokeApiAdapterMock.mockResolvedValueOnce({
      source: "gemini",
      model: WEEKLY_BRIEFING_MODEL,
      fetchedAt: "2026-05-07T12:00:00.000Z",
      sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
      sourceTitle: "주간농사정보 제19호",
      publishedAt: "2026-05-07",
      data: {
        relevant: true,
        headline: "포도 주간 브리핑",
        summaryBullets: ["과수 착과량 관리 확인"],
        actionBullets: ["포도 송이 수 기준 확인"],
        cautionBullets: ["원문 근거 확인"],
        evidenceSnippets: ["포도 캠벨얼리 생산기준"],
      },
    });

    const briefing = await getWeeklyFarmBriefing({
      cropName: "포도",
      weeklyInfo: weeklyInfo(),
    });

    expect(invokeApiAdapterMock).toHaveBeenCalledWith(
      "gemini",
      "weekly-farm-briefing-proxy",
      expect.objectContaining({
        model: "gemini-3-flash-preview",
        cropName: "포도",
        cropGroup: "과수",
        sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
      }),
      expect.objectContaining({ timeout: 30000 }),
    );
    expect(briefing).toMatchObject({
      headline: "포도 주간 브리핑",
      cropName: "포도",
      cropGroup: "과수",
      model: WEEKLY_BRIEFING_MODEL,
      cacheStatus: "fresh",
    });
    expect(weeklySummaryStore.rows.get("url:https://www.nongsaro.go.kr/week.pdf")).toMatchObject({
      summary_status: "ready",
      summary_text: expect.stringContaining("포도 주간 브리핑"),
    });
  });

  it("keeps raw weather out of the PDF request while returning it as runtime context", async () => {
    const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);
    invokeApiAdapterMock.mockResolvedValueOnce({
      source: "gemini",
      model: WEEKLY_BRIEFING_MODEL,
      fetchedAt: "2026-05-07T12:00:00.000Z",
      sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
      sourceTitle: "주간농사정보 제19호",
      publishedAt: "2026-05-07",
      data: {
        relevant: true,
        headline: "구미 포도밭 고습 대비 주간 브리핑",
        summaryBullets: ["포도 과수원은 고습 조건에서 병 발생 징후를 확인합니다."],
        actionBullets: ["구미 포도밭 배수로와 잎 뒷면을 확인합니다."],
        cautionBullets: ["기상 조건만으로 병해충 발생을 확정하지 않습니다."],
        weatherBullets: ["강수 24mm, 습도 88% 조건입니다."],
        pestRiskBullets: ["고습으로 곰팡이성 병 징후 확인이 필요합니다."],
        irrigationBullets: ["강수 후 토양 수분을 확인한 뒤 관수 여부를 판단합니다."],
        growthManagementBullets: ["착과기 송이 관리와 통풍 상태를 같이 확인합니다."],
        evidenceSnippets: ["포도 캠벨얼리 생산기준"],
      },
    });

    const briefing = await getWeeklyFarmBriefing({
      cropName: "포도",
      weeklyInfo: weeklyInfo(),
      field: {
        id: "field-1",
        name: "구미 포도밭",
        address: "경상북도 구미시",
        lat: 36.119,
        lng: 128.344,
        growthStage: "착과기",
        areaM2: 699.2,
      },
      weather: {
        sourceStatus: "connected",
        collectedAt: "2026-05-07T07:00:00.000Z",
        precipitation: 24,
        temperature: 26,
        wind: 3.4,
        humidity: 88,
        riskScore: 62,
        riskSummary: "강수 24mm, 고습 88%",
      },
    });

    expect(invokeApiAdapterMock).toHaveBeenCalledWith(
      "gemini",
      "weekly-farm-briefing-proxy",
      expect.objectContaining({
        cropName: "포도",
        cropGroup: "과수",
        field: null,
        weather: null,
      }),
      expect.objectContaining({ timeout: 30000 }),
    );
    expect(briefing).toMatchObject({
      headline: "구미 포도밭 고습 대비 주간 브리핑",
      fieldContext: expect.objectContaining({ name: "구미 포도밭" }),
      weatherContext: expect.objectContaining({ humidity: 88 }),
      weatherBullets: ["강수 24mm, 습도 88% 조건입니다."],
      pestRiskBullets: ["고습으로 곰팡이성 병 징후 확인이 필요합니다."],
      irrigationBullets: ["강수 후 토양 수분을 확인한 뒤 관수 여부를 판단합니다."],
      growthManagementBullets: ["착과기 송이 관리와 통풍 상태를 같이 확인합니다."],
    });
    expect(weeklySummaryStore.rows.get("url:https://www.nongsaro.go.kr/week.pdf")?.summary_payload)
      .toMatchObject({
        fieldContext: null,
        weatherContext: null,
        contextKey: expect.any(String),
      });
  });

  it("does not reuse a persisted briefing from a different field or weather context", async () => {
    weeklySummaryStore.rows.set("url:https://www.nongsaro.go.kr/week.pdf", {
      summary_status: "ready",
      summary_payload: {
        relevant: true,
        headline: "다른 필지 저장 브리핑",
        summaryBullets: ["다른 필지 요약"],
        actionBullets: ["다른 필지 작업"],
        cautionBullets: [],
        evidenceSnippets: [],
        cropName: "포도",
        cropGroup: "과수",
        sourceTitle: "주간농사정보 제19호",
        sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
        publishedAt: "2026-05-07",
        model: WEEKLY_BRIEFING_MODEL,
        fetchedAt: "2026-05-07T12:00:00.000Z",
        contextKey: "field:other|weather:old",
      },
    });

    const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);
    invokeApiAdapterMock.mockResolvedValueOnce({
      source: "gemini",
      model: WEEKLY_BRIEFING_MODEL,
      fetchedAt: "2026-05-07T13:00:00.000Z",
      sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
      sourceTitle: "주간농사정보 제19호",
      publishedAt: "2026-05-07",
      data: {
        relevant: true,
        headline: "현재 필지 신규 브리핑",
        summaryBullets: ["현재 필지 요약"],
        actionBullets: ["현재 필지 작업"],
        cautionBullets: [],
        evidenceSnippets: ["포도"],
      },
    });

    const briefing = await getWeeklyFarmBriefing({
      cropName: "포도",
      weeklyInfo: weeklyInfo(),
      field: { id: "field-1", name: "현재 포도밭", address: null, lat: 36.1, lng: 128.3 },
      weather: {
        sourceStatus: "connected",
        collectedAt: "2026-05-07T13:00:00.000Z",
        precipitation: 0,
        temperature: 23,
        wind: 2,
        humidity: 61,
      },
    });

    expect(invokeApiAdapterMock).toHaveBeenCalledTimes(1);
    expect(briefing).toMatchObject({
      headline: "현재 필지 신규 브리핑",
      cacheStatus: "fresh",
    });
  });

  it("reuses the base PDF briefing when only ordinary weather values change", async () => {
    const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);
    invokeApiAdapterMock.mockResolvedValueOnce({
      source: "gemini",
      model: WEEKLY_BRIEFING_MODEL,
      fetchedAt: "2026-05-07T12:00:00.000Z",
      sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
      sourceTitle: "weekly farm info 19",
      publishedAt: "2026-05-07",
      data: {
        relevant: true,
        headline: "?щ룄 grape base PDF briefing",
        summaryBullets: ["?щ룄 base PDF summary"],
        actionBullets: ["?щ룄 base PDF action"],
        cautionBullets: [],
        evidenceSnippets: ["?щ룄"],
      },
    });

    await getWeeklyFarmBriefing({
      cropName: "?щ룄",
      weeklyInfo: weeklyInfo(),
      field: { id: "field-1", name: "field one", address: null, lat: 36.1, lng: 128.3 },
      weather: {
        sourceStatus: "connected",
        collectedAt: "2026-05-07T12:00:00.000Z",
        precipitation: 0,
        temperature: 23,
        wind: 2,
        humidity: 61,
      },
    });
    const briefing = await getWeeklyFarmBriefing({
      cropName: "?щ룄",
      weeklyInfo: weeklyInfo(),
      field: { id: "field-1", name: "field one", address: null, lat: 36.1, lng: 128.3 },
      weather: {
        sourceStatus: "connected",
        collectedAt: "2026-05-07T13:00:00.000Z",
        precipitation: 1,
        temperature: 24,
        wind: 2.4,
        humidity: 64,
      },
    });

    expect(invokeApiAdapterMock).toHaveBeenCalledTimes(1);
    expect(invokeApiAdapterMock).toHaveBeenCalledWith(
      "gemini",
      "weekly-farm-briefing-proxy",
      expect.objectContaining({
        field: null,
        weather: null,
      }),
      expect.any(Object),
    );
    expect(briefing).toMatchObject({
      headline: "?щ룄 grape base PDF briefing",
      cacheStatus: "cached",
      weatherIncidentKey: "normal",
      weatherContext: expect.objectContaining({ precipitation: 1, temperature: 24 }),
    });
  });

  it("adds a critical weather correction to a stored base briefing without re-summarizing the PDF", async () => {
    weeklySummaryStore.rows.set("url:https://www.nongsaro.go.kr/week.pdf", {
      summary_status: "ready",
      summary_payload: {
        relevant: true,
        headline: "stored grape base PDF briefing",
        summaryBullets: ["stored summary"],
        actionBullets: ["stored action"],
        cautionBullets: ["stored caution"],
        weatherBullets: [],
        pestRiskBullets: [],
        irrigationBullets: [],
        growthManagementBullets: [],
        evidenceSnippets: ["stored evidence"],
        cropName: "?щ룄",
        cropGroup: "怨쇱닔",
        fieldContext: null,
        weatherContext: null,
        sourceTitle: "weekly farm info 19",
        sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
        publishedAt: "2026-05-07",
        model: WEEKLY_BRIEFING_MODEL,
        fetchedAt: "2026-05-07T12:00:00.000Z",
        contextKey: JSON.stringify({
          baseBriefingKey: "url:https://www.nongsaro.go.kr/week.pdf|2026-05-11|2026-05-17|?щ룄",
          weatherIncidentKey: "normal",
        }),
        baseBriefingKey: "url:https://www.nongsaro.go.kr/week.pdf|2026-05-11|2026-05-17|?щ룄",
        weatherIncidentKey: "normal",
      },
    });

    const briefing = await getWeeklyFarmBriefing({
      cropName: "?щ룄",
      weeklyInfo: weeklyInfo(),
      weather: {
        sourceStatus: "connected",
        collectedAt: "2026-05-09T03:00:00.000Z",
        precipitation: 35,
        temperature: 22,
        wind: 4,
        humidity: 92,
      },
    });

    expect(invokeApiAdapter).not.toHaveBeenCalled();
    expect(briefing).toMatchObject({
      headline: "stored grape base PDF briefing",
      cacheStatus: "cached",
      weatherIncidentKey: "heavy_rain:2026-05-09:high",
      weatherContext: expect.objectContaining({ precipitation: 35 }),
    });
    expect(briefing?.contextKey).toContain("heavy_rain:2026-05-09:high");
    expect(briefing?.weatherBullets.join("\n")).toContain("35mm");
    expect(briefing?.actionBullets.join("\n")).toContain("35mm");
  });

  it("uses the cached briefing without invoking the proxy when latest weekly info is unchanged", async () => {
    const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);
    invokeApiAdapterMock.mockResolvedValueOnce({
      source: "gemini",
      model: WEEKLY_BRIEFING_MODEL,
      fetchedAt: "2026-05-07T12:00:00.000Z",
      sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
      sourceTitle: "주간농사정보 제19호",
      publishedAt: "2026-05-07",
      data: {
        relevant: true,
        headline: "포도 주간 브리핑",
        summaryBullets: ["과수 착과량 관리 확인"],
        actionBullets: ["포도 송이 수 기준 확인"],
        cautionBullets: ["원문 근거 확인"],
        evidenceSnippets: ["포도 캠벨얼리 생산기준"],
      },
    });

    const input = {
      cropName: "포도",
      weeklyInfo: weeklyInfo(),
    };

    await getWeeklyFarmBriefing(input);
    const briefing = await getWeeklyFarmBriefing(input);

    expect(invokeApiAdapterMock).toHaveBeenCalledTimes(1);
    expect(briefing).toMatchObject({
      headline: "포도 주간 브리핑",
      cacheStatus: "cached",
    });
  });

  it("uses a Supabase persisted briefing without invoking the proxy", async () => {
    weeklySummaryStore.rows.set("url:https://www.nongsaro.go.kr/week.pdf", {
      summary_status: "ready",
      summary_payload: {
        relevant: true,
        headline: "저장된 포도 주간 브리핑",
        summaryBullets: ["저장 요약"],
        actionBullets: ["저장 확인"],
        cautionBullets: ["원문 확인"],
        evidenceSnippets: ["저장 근거"],
        cropName: "포도",
        cropGroup: "과수",
        sourceTitle: "주간농사정보 제19호",
        sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
        publishedAt: "2026-05-07",
        model: WEEKLY_BRIEFING_MODEL,
        fetchedAt: "2026-05-07T12:00:00.000Z",
      },
    });

    const briefing = await getWeeklyFarmBriefing({
      cropName: "포도",
      weeklyInfo: weeklyInfo(),
    });

    expect(invokeApiAdapter).not.toHaveBeenCalled();
    expect(briefing).toMatchObject({
      headline: "저장된 포도 주간 브리핑",
      cacheStatus: "cached",
    });
  });

  it("bypasses persisted briefing when forceRefresh is requested", async () => {
    weeklySummaryStore.rows.set("url:https://www.nongsaro.go.kr/week.pdf", {
      summary_status: "ready",
      summary_payload: {
        relevant: true,
        headline: "저장된 포도 주간 브리핑",
        summaryBullets: ["저장 요약"],
        actionBullets: ["저장 확인"],
        cautionBullets: ["원문 확인"],
        evidenceSnippets: ["저장 근거"],
        cropName: "포도",
        cropGroup: "과수",
        sourceTitle: "주간농사정보 제19호",
        sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
        publishedAt: "2026-05-07",
        model: WEEKLY_BRIEFING_MODEL,
        fetchedAt: "2026-05-07T12:00:00.000Z",
      },
    });
    const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);
    invokeApiAdapterMock.mockResolvedValueOnce({
      source: "gemini",
      model: WEEKLY_BRIEFING_MODEL,
      fetchedAt: "2026-05-07T13:00:00.000Z",
      sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
      sourceTitle: "주간농사정보 제19호",
      publishedAt: "2026-05-07",
      data: {
        relevant: true,
        headline: "새 포도 주간 브리핑",
        summaryBullets: ["새 요약"],
        actionBullets: ["새 확인"],
        cautionBullets: ["원문 근거 확인"],
        evidenceSnippets: ["포도 캠벨얼리 생산기준"],
      },
    });

    const briefing = await getWeeklyFarmBriefing({
      cropName: "포도",
      weeklyInfo: weeklyInfo({ summaryStatus: "ready" }),
      forceRefresh: true,
    });

    expect(invokeApiAdapterMock).toHaveBeenCalledTimes(1);
    expect(briefing).toMatchObject({
      headline: "새 포도 주간 브리핑",
      cacheStatus: "fresh",
    });
    expect(weeklySummaryStore.rows.get("url:https://www.nongsaro.go.kr/week.pdf")).toMatchObject({
      summary_text: expect.stringContaining("새 포도 주간 브리핑"),
    });
  });

  it("still returns a fresh briefing when the persistence table is not deployed", async () => {
    weeklySummaryStore.missingTable = true;
    const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);
    invokeApiAdapterMock.mockResolvedValueOnce({
      source: "gemini",
      model: WEEKLY_BRIEFING_MODEL,
      fetchedAt: "2026-05-07T12:00:00.000Z",
      sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
      sourceTitle: "주간농사정보 제19호",
      publishedAt: "2026-05-07",
      data: {
        relevant: true,
        headline: "포도 주간 브리핑",
        summaryBullets: ["과수 착과량 관리 확인"],
        actionBullets: ["포도 송이 수 기준 확인"],
        cautionBullets: ["원문 근거 확인"],
        evidenceSnippets: ["포도 캠벨얼리 생산기준"],
      },
    });

    const briefing = await getWeeklyFarmBriefing({
      cropName: "포도",
      weeklyInfo: weeklyInfo(),
    });

    expect(briefing).toMatchObject({
      headline: "포도 주간 브리핑",
      cacheStatus: "fresh",
    });
    expect(weeklySummaryStore.rows.size).toBe(0);
  });

  it("invokes the proxy again when the latest weekly PDF changes", async () => {
    const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);
    invokeApiAdapterMock
      .mockResolvedValueOnce({
        source: "gemini",
        model: WEEKLY_BRIEFING_MODEL,
        fetchedAt: "2026-05-07T12:00:00.000Z",
        sourceUrl: "https://www.nongsaro.go.kr/week-19.pdf",
        sourceTitle: "주간농사정보 제19호",
        publishedAt: "2026-05-07",
        data: {
          relevant: true,
          headline: "포도 19호 브리핑",
          summaryBullets: ["19호 요약"],
          actionBullets: ["19호 확인"],
          cautionBullets: ["19호 주의"],
          evidenceSnippets: ["19호 근거"],
        },
      })
      .mockResolvedValueOnce({
        source: "gemini",
        model: WEEKLY_BRIEFING_MODEL,
        fetchedAt: "2026-05-14T12:00:00.000Z",
        sourceUrl: "https://www.nongsaro.go.kr/week-20.pdf",
        sourceTitle: "주간농사정보 제20호",
        publishedAt: "2026-05-14",
        data: {
          relevant: true,
          headline: "포도 20호 브리핑",
          summaryBullets: ["20호 요약"],
          actionBullets: ["20호 확인"],
          cautionBullets: ["20호 주의"],
          evidenceSnippets: ["20호 근거"],
        },
      });

    await getWeeklyFarmBriefing({
      cropName: "포도",
      weeklyInfo: weeklyInfo({
        sourceKey: "url:https://www.nongsaro.go.kr/week-19.pdf",
        title: "주간농사정보 제19호",
        publishedAt: "2026-05-07",
        sourceUrl: "https://www.nongsaro.go.kr/week-19.pdf",
        sourceFileName: "week-19.pdf",
      }),
    });
    const briefing = await getWeeklyFarmBriefing({
      cropName: "포도",
      weeklyInfo: weeklyInfo({
        sourceKey: "url:https://www.nongsaro.go.kr/week-20.pdf",
        title: "주간농사정보 제20호",
        publishedAt: "2026-05-14",
        sourceUrl: "https://www.nongsaro.go.kr/week-20.pdf",
        sourceFileName: "week-20.pdf",
      }),
    });

    expect(invokeApiAdapterMock).toHaveBeenCalledTimes(2);
    expect(briefing).toMatchObject({
      headline: "포도 20호 브리핑",
      cacheStatus: "fresh",
    });
  });

  it("does not invoke the proxy when the weekly document has no PDF source", async () => {
    const briefing = await getWeeklyFarmBriefing({
      cropName: "포도",
      weeklyInfo: weeklyInfo({
        sourceKey: "url:https://www.nongsaro.go.kr/week-27.hwpx",
        sourceUrl: "https://www.nongsaro.go.kr/week-27.hwpx",
        downUrlList: ["https://www.nongsaro.go.kr/week-27.hwpx"],
        sourceFileName: "week-27.hwpx",
      }),
    });

    expect(invokeApiAdapter).not.toHaveBeenCalled();
    expect(briefing).toMatchObject({
      headline: "포도 주간농사정보 AI 요약 지연",
      cacheStatus: "unavailable",
      errorCode: "unsupported_weekly_document",
      sourceUrl: "https://www.nongsaro.go.kr/week-27.hwpx",
    });
  });

  it("does not trust a PDF file name when the weekly download URL is not a PDF URL", async () => {
    const briefing = await getWeeklyFarmBriefing({
      cropName: "포도",
      weeklyInfo: weeklyInfo({
        sourceKey: "url:https://www.nongsaro.go.kr/fileDownload.do?fileId=weekly-27",
        sourceUrl: "https://www.nongsaro.go.kr/fileDownload.do?fileId=weekly-27",
        downUrlList: ["https://www.nongsaro.go.kr/fileDownload.do?fileId=weekly-27"],
        sourceFileName: "week-27.pdf",
      }),
    });

    expect(invokeApiAdapter).not.toHaveBeenCalled();
    expect(briefing).toMatchObject({
      cacheStatus: "unavailable",
      errorCode: "unsupported_weekly_document",
      sourceUrl: "https://www.nongsaro.go.kr/fileDownload.do?fileId=weekly-27",
    });
  });

  it("uses a PDF from the download list when the primary weekly document is not a PDF", async () => {
    const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);
    invokeApiAdapterMock.mockResolvedValueOnce({
      source: "gemini",
      model: WEEKLY_BRIEFING_MODEL,
      fetchedAt: "2026-07-07T09:45:00.000Z",
      sourceUrl: "https://www.nongsaro.go.kr/week-27.pdf",
      sourceTitle: "주간농사정보 제27호",
      publishedAt: "2026-06-30",
      data: {
        relevant: true,
        headline: "포도 27호 브리핑",
        summaryBullets: ["포도 과수원 배수와 병해충 예찰을 확인합니다."],
        actionBullets: ["포도 생육 상태를 확인합니다."],
        cautionBullets: ["원문 근거를 확인합니다."],
        evidenceSnippets: ["포도 과원 관리"],
      },
    });

    const briefing = await getWeeklyFarmBriefing({
      cropName: "포도",
      weeklyInfo: weeklyInfo({
        sourceKey: "url:https://www.nongsaro.go.kr/week-27.hwpx",
        title: "주간농사정보 제27호",
        publishedAt: "2026-06-30",
        sourceUrl: "https://www.nongsaro.go.kr/week-27.hwpx",
        downUrlList: [
          "https://www.nongsaro.go.kr/week-27.hwpx",
          "https://www.nongsaro.go.kr/week-27.pdf",
        ],
        sourceFileName: "week-27.hwpx",
      }),
    });

    expect(invokeApiAdapterMock).toHaveBeenCalledWith(
      "gemini",
      "weekly-farm-briefing-proxy",
      expect.objectContaining({
        sourceUrl: "https://www.nongsaro.go.kr/week-27.pdf",
      }),
      expect.objectContaining({ timeout: 30000 }),
    );
    expect(briefing).toMatchObject({
      headline: "포도 27호 브리핑",
      sourceUrl: "https://www.nongsaro.go.kr/week-27.pdf",
      cacheStatus: "fresh",
    });
  });

  it("returns an unavailable briefing state when the proxy fails and no cache exists", async () => {
    const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);
    invokeApiAdapterMock.mockRejectedValueOnce(
      Object.assign(new Error("Upstream request timed out."), { code: "upstream_error" }),
    );

    const briefing = await getWeeklyFarmBriefing({
      cropName: "포도",
      weeklyInfo: weeklyInfo(),
    });

    expect(briefing).toMatchObject({
      headline: "포도 주간농사정보 AI 요약 지연",
      actionBullets: [],
      cacheStatus: "unavailable",
      errorCode: "upstream_error",
    });
  });

  it("suppresses Gemini output when it summarizes another crop", async () => {
    const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);
    invokeApiAdapterMock.mockResolvedValueOnce({
      source: "gemini",
      model: WEEKLY_BRIEFING_MODEL,
      fetchedAt: "2026-05-07T12:00:00.000Z",
      sourceUrl: "https://www.nongsaro.go.kr/week.pdf",
      sourceTitle: "주간농사정보 제19호",
      publishedAt: "2026-05-07",
      data: {
        relevant: true,
        headline: "벼 못자리 온도 관리",
        summaryBullets: ["못자리 온도를 확인합니다."],
        actionBullets: ["모내기 시기를 확인합니다."],
        cautionBullets: ["논물 관리에 주의합니다."],
        evidenceSnippets: ["벼 못자리 관리"],
      },
    });

    const briefing = await getWeeklyFarmBriefing({
      cropName: "포도",
      weeklyInfo: weeklyInfo(),
    });

    expect(briefing).toMatchObject({
      relevant: false,
      headline: "포도 관련 주간농사정보 없음",
      summaryBullets: [],
      actionBullets: [],
      evidenceSnippets: [],
    });
  });
});
