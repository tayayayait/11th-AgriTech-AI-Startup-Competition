import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { refineTaskCardsWithGemini } from "@/services/geminiTaskCardService";
import { generateAndSaveTaskCardsForField } from "@/services/taskGenerationService";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock("@/services/geminiTaskCardService", async () => {
  const actual = await vi.importActual<typeof import("@/services/geminiTaskCardService")>("@/services/geminiTaskCardService");
  return {
    ...actual,
    extractChecksFromDetailText: vi.fn(),
    refineTaskCardsWithGemini: vi.fn(),
  };
});

const supabaseFromMock = vi.mocked(supabase.from);
const refineTaskCardsWithGeminiMock = vi.mocked(refineTaskCardsWithGemini);

function makeQueryBuilder() {
  const builder = {
    delete: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    in: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: undefined,
  };
  return builder;
}

describe("generateAndSaveTaskCardsForField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refineTaskCardsWithGeminiMock.mockResolvedValue([]);
  });

  it("replaces generated pending cards and inserts due dates/checklists/sources", async () => {
    const taskBuilder = makeQueryBuilder();
    taskBuilder.eq.mockImplementation((column: string, value?: string) => {
      if (column === "status" && value === "done") {
        return Promise.resolve({ data: [], error: null }) as never;
      }
      if (column === "status" && value === "pending") {
        return Promise.resolve({ data: null, error: null }) as never;
      }
      return taskBuilder;
    });
    taskBuilder.insert.mockReturnValue({
      select: () => ({
        order: async () => ({
          data: [
            {
              id: "task-1",
              field_id: "field-1",
              priority: 1,
              title: "강수 후 배수로·포장 상태 점검",
              reason: "강수 32mm",
              duration_min: 30,
              checks: [{ label: "배수로 막힘 확인", done: false }],
              sources: [{ name: "KMA 날씨 위험도" }],
              status: "pending",
              completed_at: null,
              due_at: "2026-05-06T00:00:00.000Z",
            },
          ],
          error: null,
        }),
      }),
    } as never);
    supabaseFromMock.mockReturnValue(taskBuilder as never);

    const saved = await generateAndSaveTaskCardsForField({
      fieldId: "field-1",
      cropName: "벼",
      today: new Date("2026-05-06T00:00:00.000Z"),
      weatherRisk: {
        score: 82,
        summary: "강수 32mm",
        precipitation: 32,
        temperature: 24,
        wind: 4,
        humidity: 88,
        collectedAt: "2026-05-06T07:00:00.000Z",
      },
      pestRisks: [],
      workSchedules: [],
      weeklyInfos: [],
    });

    expect(saved).toHaveLength(1);
    expect(taskBuilder.delete).toHaveBeenCalled();
    expect(taskBuilder.in).toHaveBeenCalledWith("title", ["강수 후 배수로·포장 상태 점검", "고습 병 발생 징후 확인"]);
    expect(taskBuilder.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          field_id: "field-1",
          priority: 1,
          title: "강수 후 배수로·포장 상태 점검",
          status: "pending",
          checks: expect.arrayContaining([expect.objectContaining({ label: "배수로 막힘 확인", done: false })]),
          sources: expect.arrayContaining([expect.objectContaining({ name: "KMA 날씨 위험도" })]),
        }),
      ]),
    );
  });

  it("keeps deterministic task candidates when Gemini refinement fails", async () => {
    const taskBuilder = makeQueryBuilder();
    taskBuilder.eq.mockImplementation((column: string, value?: string) => {
      if (column === "status" && value === "done") {
        return Promise.resolve({ data: [], error: null }) as never;
      }
      if (column === "status" && value === "pending") {
        return Promise.resolve({ data: null, error: null }) as never;
      }
      return taskBuilder;
    });
    taskBuilder.insert.mockReturnValue({
      select: () => ({
        order: async () => ({ data: [], error: null }),
      }),
    } as never);
    supabaseFromMock.mockReturnValue(taskBuilder as never);
    refineTaskCardsWithGeminiMock.mockRejectedValueOnce(new Error("Gemini unavailable"));

    const saved = await generateAndSaveTaskCardsForField({
      fieldId: "field-1",
      cropName: "grape",
      today: new Date("2026-05-06T00:00:00.000Z"),
      weatherRisk: {
        score: 82,
        summary: "rain 32mm",
        precipitation: 32,
        temperature: 24,
        wind: 4,
        humidity: 55,
        collectedAt: "2026-05-06T07:00:00.000Z",
      },
      pestRisks: [],
      workSchedules: [],
      weeklyInfos: [],
    });

    expect(saved).toEqual([]);
    expect(refineTaskCardsWithGeminiMock).toHaveBeenCalledTimes(1);
    expect(taskBuilder.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          field_id: "field-1",
          due_at: "2026-05-06T00:00:00.000Z",
        }),
      ]),
    );
  });

  it("removes stale generated pending cards even when no new draft is created", async () => {
    const taskBuilder = makeQueryBuilder();
    taskBuilder.eq.mockImplementation((column: string, value?: string) => {
      if (column === "status" && value === "pending") {
        return Promise.resolve({ data: null, error: null }) as never;
      }
      return taskBuilder;
    });
    supabaseFromMock.mockReturnValue(taskBuilder as never);

    const saved = await generateAndSaveTaskCardsForField({
      fieldId: "field-1",
      cropName: "포도",
      today: new Date("2026-05-07T00:00:00.000+09:00"),
      weatherRisk: {
        score: 0,
        summary: "기상 위험 신호가 낮습니다.",
        precipitation: 0,
        temperature: 20,
        wind: 2,
        humidity: 55,
        collectedAt: "2026-05-07T00:00:00.000Z",
      },
      pestRisks: [],
      workSchedules: [],
      weeklyInfos: [
        {
          title: "주간농사정보 제 19호",
          publishedAt: "2026-05-07",
          sourceUrl: "https://example.test/week.pdf",
        },
      ],
    });

    expect(saved).toEqual([]);
    expect(taskBuilder.delete).toHaveBeenCalled();
    expect(taskBuilder.ilike).toHaveBeenCalledWith("title", "주간농사정보 확인:%");
    expect(taskBuilder.select).not.toHaveBeenCalled();
    expect(taskBuilder.insert).not.toHaveBeenCalled();
  });

  it("does not insert work schedule cards when work schedule task generation is disabled", async () => {
    const taskBuilder = makeQueryBuilder();
    taskBuilder.eq.mockImplementation((column: string, value?: string) => {
      if (column === "status" && value === "pending") {
        return Promise.resolve({ data: null, error: null }) as never;
      }
      return taskBuilder;
    });
    supabaseFromMock.mockReturnValue(taskBuilder as never);

    const saved = await generateAndSaveTaskCardsForField({
      fieldId: "field-1",
      cropName: "포도",
      today: new Date("2026-05-07T00:00:00.000+09:00"),
      weatherRisk: {
        score: 0,
        summary: "기상 위험 신호가 낮습니다.",
        precipitation: 0,
        temperature: 20,
        wind: 2,
        humidity: 55,
        collectedAt: "2026-05-07T00:00:00.000Z",
      },
      pestRisks: [],
      workSchedules: [
        {
          sourceId: "grape-1",
          title: "포도(무가온)",
          cropName: "과수",
          detailText: null,
          fileUrl: "https://example.test/grape.pdf",
          eras: [
            {
              operationName: "꽃송이 다듬기",
              farmWorkFlag: "무가온",
              beginMonth: 5,
              endMonth: 5,
              beginEra: "상",
              endEra: "상",
              requiredMonth: 1,
              infoType: "생육과정(주요농작업)",
              videoUrl: null,
            },
          ],
        },
      ],
      weeklyInfos: [],
      includeWorkScheduleTasks: false,
    });

    expect(saved).toEqual([]);
    expect(taskBuilder.delete).toHaveBeenCalled();
    expect(taskBuilder.ilike).toHaveBeenCalledWith("title", "농작업일정 실행:%");
    expect(taskBuilder.insert).not.toHaveBeenCalled();
  });
});
