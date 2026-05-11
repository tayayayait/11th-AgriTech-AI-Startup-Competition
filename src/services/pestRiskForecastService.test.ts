import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { generateAndSavePestRiskForecast } from "@/services/pestRiskForecastService";
import { getDisasterPreventionSources } from "@/services/nongsaroDisasterService";
import { getNpmsPestCandidateSources } from "@/services/npmsPestService";

vi.mock("@/services/npmsPestService", () => ({
  getNpmsPestCandidateSources: vi.fn(),
}));

vi.mock("@/services/nongsaroDisasterService", () => ({
  getDisasterPreventionSources: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const getNpmsPestCandidateSourcesMock = vi.mocked(getNpmsPestCandidateSources);
const getDisasterPreventionSourcesMock = vi.mocked(getDisasterPreventionSources);
const supabaseFromMock = vi.mocked(supabase.from);

function makeQueryBuilder() {
  const builder = {
    delete: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    select: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    single: vi.fn(async () => ({ data: { id: "risk-1" }, error: null })),
  };
  return builder;
}

describe("generateAndSavePestRiskForecast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores pest_risks with reasons and official sources", async () => {
    const pestBuilder = makeQueryBuilder();
    const fieldBuilder = makeQueryBuilder();
    supabaseFromMock.mockImplementation((tableName: string) => {
      if (tableName === "pest_risks") return pestBuilder as never;
      if (tableName === "fields") return fieldBuilder as never;
      throw new Error(`unexpected table ${tableName}`);
    });
    getNpmsPestCandidateSourcesMock.mockResolvedValue([
      {
        type: "npms",
        title: "논벼 병: 이삭도열병",
        url: null,
      },
    ]);
    getDisasterPreventionSourcesMock.mockResolvedValue([
      {
        sourceId: "disaster-1",
        title: "농작물 고온해 위험 예측보고",
        publishedAt: "2024-09-12",
        attachmentName: null,
        attachmentPath: "https://example.test/disaster.pdf",
        thumbnailName: null,
      },
    ]);

    const result = await generateAndSavePestRiskForecast({
      fieldId: "field-1",
      cropName: "벼",
      weather: {
        temperature: 35,
        precipitation: 0,
        wind: 3,
        humidity: 86,
      },
      weatherRiskScore: 75,
    });

    expect(result).toHaveLength(1);
    expect(pestBuilder.delete).toHaveBeenCalled();
    expect(pestBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        field_id: "field-1",
        crop_name: "벼",
        candidate_name: "벼 병해충 위험 예보/확인 권고",
        official_sources: expect.arrayContaining([
          "NCPMS 병해충정보: 논벼 병: 이삭도열병",
          "재해예방자료: 농작물 고온해 위험 예측보고 (https://example.test/disaster.pdf)",
        ]),
      }),
    );
    expect(fieldBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        risk_score: expect.any(Number),
        risk_level: expect.stringMatching(/low|watch|high|critical/),
      }),
    );
  });

  it("reuses a recent same-candidate forecast instead of writing duplicate timeline noise", async () => {
    const pestBuilder = makeQueryBuilder();
    const existingCreatedAt = new Date().toISOString();
    pestBuilder.maybeSingle.mockResolvedValue({
      data: {
        id: "existing-risk",
        field_id: "field-1",
        crop_name: "rice",
        candidate_name: "rice 병해충 위험 예보/확인 권고",
        score: 0,
        reasons: ["현재 KMA 조건상 병해충 위험 신호가 낮음"],
        official_sources: [],
        created_at: existingCreatedAt,
      },
      error: null,
    });
    const fieldBuilder = makeQueryBuilder();
    supabaseFromMock.mockImplementation((tableName: string) => {
      if (tableName === "pest_risks") return pestBuilder as never;
      if (tableName === "fields") return fieldBuilder as never;
      throw new Error(`unexpected table ${tableName}`);
    });
    getNpmsPestCandidateSourcesMock.mockResolvedValue([]);
    getDisasterPreventionSourcesMock.mockResolvedValue([]);

    const result = await generateAndSavePestRiskForecast({
      fieldId: "field-1",
      cropName: "rice",
      weather: {
        temperature: 19,
        precipitation: 0,
        wind: 2,
        humidity: 60,
      },
      weatherRiskScore: 0,
    });

    expect(result[0]).toEqual(expect.objectContaining({ id: "existing-risk" }));
    expect(pestBuilder.delete).not.toHaveBeenCalled();
    expect(pestBuilder.insert).not.toHaveBeenCalled();
    expect(fieldBuilder.update).not.toHaveBeenCalled();
  });
});
