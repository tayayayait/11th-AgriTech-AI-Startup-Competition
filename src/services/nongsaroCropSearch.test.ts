import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNongsaro } from "@/services/nongsaroClient";
import { getPestOccurrenceSources } from "@/services/nongsaroPestService";
import { getWeeklyFarmInfos } from "@/services/nongsaroWeeklyService";
import { getWorkSchedulesForCrop } from "@/services/nongsaroWorkScheduleService";

type WeeklyFarmInfoRowMock = {
  created_at: string;
  down_url: string | null;
  down_url_list: string[];
  file_name: string | null;
  hit_ct: number | null;
  id: string;
  period_end: string | null;
  period_start: string | null;
  reg_dt: string | null;
  source_key: string;
  subject: string;
  summary_fetched_at: string | null;
  summary_model: string | null;
  summary_payload: unknown;
  summary_status: string;
  summary_text: string | null;
  updated_at: string;
  writer_nm: string | null;
};

const weeklyFarmInfoStore = vi.hoisted(() => ({
  rows: [] as WeeklyFarmInfoRowMock[],
  missingTable: false,
}));

vi.mock("@/services/nongsaroClient", () => ({
  fetchNongsaro: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((tableName: string) => {
      if (tableName !== "weekly_farm_infos") throw new Error(`Unexpected table: ${tableName}`);

      return {
        select: vi.fn((columns: string) => {
          const filters: { periodStartLte?: string; periodEndGte?: string } = {};
          const builder = {
            in: vi.fn(async (_column: string, sourceKeys: string[]) => ({
              data: weeklyFarmInfoStore.rows
                .filter((row) => sourceKeys.includes(row.source_key))
                .map((row) => columns === "source_key" ? { source_key: row.source_key } : row),
              error: null,
            })),
            lte: vi.fn((_column: string, value: string) => {
              filters.periodStartLte = value;
              return builder;
            }),
            gte: vi.fn((_column: string, value: string) => {
              filters.periodEndGte = value;
              return builder;
            }),
            order: vi.fn(() => builder),
            limit: vi.fn(async (count: number) => {
              if (weeklyFarmInfoStore.missingTable) {
                return { data: null, error: { status: 404, code: "PGRST205", message: "weekly_farm_infos missing" } };
              }
              const data = weeklyFarmInfoStore.rows
                .filter((row) => {
                  const afterStart = !filters.periodStartLte
                    || (typeof row.period_start === "string" && row.period_start <= filters.periodStartLte);
                  const beforeEnd = !filters.periodEndGte
                    || (typeof row.period_end === "string" && row.period_end >= filters.periodEndGte);
                  return afterStart && beforeEnd;
                })
                .slice(0, count);
              return { data, error: null };
            }),
          };
          if (weeklyFarmInfoStore.missingTable) {
            builder.in.mockImplementation(async () => ({
              data: null,
              error: { status: 404, code: "PGRST205", message: "weekly_farm_infos missing" },
            }));
          }
          return builder;
        }),
        upsert: vi.fn(async (payload: Array<Partial<WeeklyFarmInfoRowMock> & { source_key: string; subject: string }>) => {
          if (weeklyFarmInfoStore.missingTable) {
            return { error: { status: 404, code: "PGRST205", message: "weekly_farm_infos missing" } };
          }
          for (const item of payload) {
            const existingIndex = weeklyFarmInfoStore.rows.findIndex((row) => row.source_key === item.source_key);
            const existing = existingIndex >= 0 ? weeklyFarmInfoStore.rows[existingIndex] : null;
            const row: WeeklyFarmInfoRowMock = {
              created_at: existing?.created_at ?? "2026-05-06T07:00:00.000Z",
              down_url: item.down_url ?? existing?.down_url ?? null,
              down_url_list: Array.isArray(item.down_url_list) ? item.down_url_list : existing?.down_url_list ?? [],
              file_name: item.file_name ?? existing?.file_name ?? null,
              hit_ct: item.hit_ct ?? existing?.hit_ct ?? null,
              id: existing?.id ?? `weekly-${weeklyFarmInfoStore.rows.length + 1}`,
              period_end: item.period_end ?? existing?.period_end ?? null,
              period_start: item.period_start ?? existing?.period_start ?? null,
              reg_dt: item.reg_dt ?? existing?.reg_dt ?? null,
              source_key: item.source_key,
              subject: item.subject,
              summary_fetched_at: existing?.summary_fetched_at ?? null,
              summary_model: existing?.summary_model ?? null,
              summary_payload: existing?.summary_payload ?? null,
              summary_status: existing?.summary_status ?? "pending",
              summary_text: existing?.summary_text ?? null,
              updated_at: "2026-05-06T07:00:00.000Z",
              writer_nm: item.writer_nm ?? existing?.writer_nm ?? null,
            };

            if (existingIndex >= 0) weeklyFarmInfoStore.rows[existingIndex] = row;
            else weeklyFarmInfoStore.rows.push(row);
          }
          return { error: null };
        }),
      };
    }),
  },
}));

const fetchNongsaroMock = vi.mocked(fetchNongsaro);

function nongsaroResponse(items: Array<Record<string, string>>) {
  return {
    source: "nongsaro" as const,
    serviceName: "mock",
    operationName: "mock",
    fetchedAt: "2026-05-06T07:00:00.000Z",
    data: { resultCode: "00", resultMsg: "OK", items },
    items,
    resultCode: "00",
    resultMsg: "OK",
  };
}

describe("Nongsaro crop search fallback", () => {
  beforeEach(() => {
    fetchNongsaroMock.mockReset();
    weeklyFarmInfoStore.rows = [];
    weeklyFarmInfoStore.missingTable = false;
  });

  it("uses mapped work schedule groups when direct crop matching would fail", async () => {
    fetchNongsaroMock.mockImplementation(async (_serviceName, operationName, params) => {
      if (operationName === "workScheduleGrpList") {
        return nongsaroResponse([
          { codeNm: "논농사", kidofcomdtySeCode: "210004", sort: "1" },
          { codeNm: "채소", kidofcomdtySeCode: "210001", sort: "5" },
        ]);
      }
      if (operationName === "workScheduleLst") {
        expect(params).toMatchObject({ kidofcomdtySeCode: "210004" });
        return nongsaroResponse([{ cntntsNo: "rice-1", sj: "벼 논농사 작업 일정" }]);
      }
      return nongsaroResponse([{ htmlCn: "물관리" }]);
    });

    const schedules = await getWorkSchedulesForCrop("벼");

    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({ sourceId: "rice-1", cropName: "논농사" });
  });

  it("falls back from crop title search to mapped weekly keywords", async () => {
    fetchNongsaroMock.mockImplementation(async (_serviceName, _operationName, params) => {
      if (params?.subject === "채소") {
        return nongsaroResponse([{ subject: "채소 주간농사정보", regDt: "2026-05-06" }]);
      }
      return nongsaroResponse([]);
    });

    const weeklyInfos = await getWeeklyFarmInfos("배추");

    expect(weeklyInfos.map((item) => item.title)).toEqual(["채소 주간농사정보"]);
    expect(fetchNongsaroMock).toHaveBeenCalledWith(
      "weekFarmInfo",
      "weekFarmInfoList",
      expect.objectContaining({ subject: "배추" }),
    );
    expect(fetchNongsaroMock).toHaveBeenCalledWith(
      "weekFarmInfo",
      "weekFarmInfoList",
      expect.objectContaining({ subject: "채소" }),
    );
  });

  it("falls back to latest weekly list when all title searches return empty", async () => {
    fetchNongsaroMock.mockImplementation(async (_serviceName, _operationName, params) => {
      if (!("subject" in (params ?? {}))) {
        return nongsaroResponse([{ subject: "최신 주간농사정보", regDt: "2026-05-06" }]);
      }
      return nongsaroResponse([]);
    });

    const weeklyInfos = await getWeeklyFarmInfos("벼");

    expect(weeklyInfos.map((item) => item.title)).toEqual(["최신 주간농사정보"]);
    expect(fetchNongsaroMock).toHaveBeenLastCalledWith(
      "weekFarmInfo",
      "weekFarmInfoList",
      expect.not.objectContaining({ subject: expect.anything() }),
    );
  });

  it("stores weekly farm info and exposes the current KST period from the title", async () => {
    fetchNongsaroMock.mockImplementation(async (_serviceName, _operationName, params) => {
      if ("subject" in (params ?? {})) return nongsaroResponse([]);
      return nongsaroResponse([
        {
          subject: "주간농사정보 제 19호 (2026.5.11.~5.17.)",
          regDt: "2026-05-07",
          writerNm: "농촌진흥청",
          downUrl: "http://www.nongsaro.go.kr/week-19.pdf",
          downUrlList: "http://www.nongsaro.go.kr/week-19.hwpx|http://www.nongsaro.go.kr/week-19.hwp|http://www.nongsaro.go.kr/week-19.pdf",
          fileName: "week-19.pdf",
        },
        {
          subject: "주간농사정보 제 20호 (2026.5.18.~5.24.)",
          regDt: "2026-05-14",
          downUrl: "http://www.nongsaro.go.kr/week-20.pdf",
          fileName: "week-20.pdf",
        },
      ]);
    });

    const weeklyInfos = await getWeeklyFarmInfos("포도", new Date("2026-05-12T00:00:00.000Z"));

    expect(weeklyInfos).toHaveLength(1);
    expect(weeklyInfos[0]).toMatchObject({
      title: "주간농사정보 제 19호 (2026.5.11.~5.17.)",
      publishedAt: "2026-05-07",
      periodStart: "2026-05-11",
      periodEnd: "2026-05-17",
      downUrlList: [
        "https://www.nongsaro.go.kr/week-19.hwpx",
        "https://www.nongsaro.go.kr/week-19.hwp",
        "https://www.nongsaro.go.kr/week-19.pdf",
      ],
      isCurrent: true,
      isNew: true,
    });
  });

  it("falls back to API results when the weekly farm info table is not deployed", async () => {
    weeklyFarmInfoStore.missingTable = true;
    fetchNongsaroMock.mockImplementation(async (_serviceName, _operationName, params) => {
      if ("subject" in (params ?? {})) return nongsaroResponse([]);
      return nongsaroResponse([
        {
          subject: "주간농사정보 제 19호 (2026.5.11.~5.17.)",
          regDt: "2026-05-07",
          downUrl: "http://www.nongsaro.go.kr/week-19.pdf",
          fileName: "week-19.pdf",
        },
      ]);
    });

    const weeklyInfos = await getWeeklyFarmInfos("포도", new Date("2026-05-12T00:00:00.000Z"));

    expect(weeklyInfos).toHaveLength(1);
    expect(weeklyInfos[0]).toMatchObject({
      title: "주간농사정보 제 19호 (2026.5.11.~5.17.)",
      periodStart: "2026-05-11",
      periodEnd: "2026-05-17",
      isCurrent: true,
      isNew: false,
    });
  });

  it("uses mapped pest keywords before latest-list fallback", async () => {
    fetchNongsaroMock.mockImplementation(async (_serviceName, operationName, params) => {
      if (operationName === "dbyhsCccrrncInfoYear") {
        return nongsaroResponse([{ yearCode: "2026" }]);
      }
      if (params?.sText === "논농사") {
        return nongsaroResponse([{ cntntsNo: "pest-1", cntntsSj: "논농사 병해충 발생정보" }]);
      }
      return nongsaroResponse([]);
    });

    const pestSources = await getPestOccurrenceSources("벼");

    expect(pestSources.map((item) => item.title)).toEqual(["논농사 병해충 발생정보"]);
    expect(fetchNongsaroMock).toHaveBeenCalledWith(
      "dbyhsCccrrncInfo",
      "dbyhsCccrrncInfoList",
      expect.objectContaining({ sText: "벼" }),
    );
    expect(fetchNongsaroMock).toHaveBeenCalledWith(
      "dbyhsCccrrncInfo",
      "dbyhsCccrrncInfoList",
      expect.objectContaining({ sText: "논농사" }),
    );
  });
});
