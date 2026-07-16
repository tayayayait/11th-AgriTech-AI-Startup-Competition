import { beforeEach, describe, expect, it, vi } from "vitest";

const recommendationStore = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<Array<Record<string, unknown>>>,
  deletes: [] as Array<Record<string, unknown>>,
}));

function rowMatchesFilters(row: Record<string, unknown>, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([column, value]) => row[column] === value);
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((tableName: string) => {
      if (tableName !== "nongsaro_work_video_recommendations") {
        throw new Error(`Unexpected table: ${tableName}`);
      }

      return {
        select: vi.fn(() => {
          const filters: Record<string, unknown> = {};
          const builder = {
            eq: vi.fn((column: string, value: unknown) => {
              filters[column] = value;
              return builder;
            }),
            order: vi.fn(async () => ({
              data: recommendationStore.rows.filter((row) => rowMatchesFilters(row, filters)),
              error: null,
            })),
          };
          return builder;
        }),
        delete: vi.fn(() => {
          const filters: Record<string, unknown> = {};
          const builder = {
            eq: vi.fn((column: string, value: unknown) => {
              filters[column] = value;
              return builder;
            }),
            then: (
              resolve: (value: { data: null; error: null }) => unknown,
              reject?: (reason: unknown) => unknown,
            ) => {
              recommendationStore.deletes.push({ ...filters });
              recommendationStore.rows = recommendationStore.rows.filter((row) => !rowMatchesFilters(row, filters));
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            },
          };
          return builder;
        }),
        upsert: vi.fn((payload: Array<Record<string, unknown>>) => {
          recommendationStore.upserts.push(payload);
          return {
            select: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: payload,
                error: null,
              })),
            })),
          };
        }),
      };
    }),
  },
}));

vi.mock("@/services/cropEbookService", () => ({
  getCropEbookVideosForCrop: vi.fn(),
}));

vi.mock("@/services/geminiClient", () => ({
  analyzeWithGemini: vi.fn(),
}));

import { getCropEbookVideosForCrop } from "@/services/cropEbookService";
import { analyzeWithGemini } from "@/services/geminiClient";
import {
  buildWorkVideoRecommendationKey,
  clearWorkVideoRecommendationRuntimeCache,
  filterVisibleWorkVideoRecommendations,
  getWorkVideoRecommendationsForEra,
  parseWorkVideoJudgementFromGeminiResponse,
} from "@/services/nongsaroWorkVideoRecommendationService";

const getCropEbookVideosForCropMock = vi.mocked(getCropEbookVideosForCrop);
const analyzeWithGeminiMock = vi.mocked(analyzeWithGemini);

const input = {
  fieldId: "field-1",
  cropName: "peach",
  scheduleSourceId: "30662",
  workItem: "flower thinning",
  infoType: "growth",
  periodLabel: "April-May",
  scheduleMonth: 5,
  farmWorkFlag: "fruit load control",
};

const workItemKey = buildWorkVideoRecommendationKey(input);

describe("nongsaroWorkVideoRecommendationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearWorkVideoRecommendationRuntimeCache();
    recommendationStore.rows = [];
    recommendationStore.upserts = [];
    recommendationStore.deletes = [];
  });

  it("uses persisted recommendations without refetching crop videos or Gemini judgement", async () => {
    recommendationStore.rows = [
      {
        field_id: "field-1",
        work_item_key: workItemKey,
        crop_name: "peach",
        sub_category_code: "PEACH",
        schedule_source_id: "30662",
        work_item: "flower thinning",
        work_item_period: "April-May",
        video_title: "Stored peach thinning",
        video_origin_instt: "RDA",
        video_link: "https://example.test/stored",
        video_img: "http://www.nongsaro.go.kr/image/stored.jpg",
        match_score: 95,
        match_type: "direct",
        reason: "Stored judgement.",
        source_api: "nongsaro.cropEbook.videoList",
        judged_by: "gemini",
        fetched_at: "2026-05-08T00:00:00.000Z",
      },
    ];

    const result = await getWorkVideoRecommendationsForEra(input);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      cropName: "peach",
      workItemTitle: "flower thinning",
      workItemPeriod: "April-May",
      videoTitle: "Stored peach thinning",
      videoImg: "https://www.nongsaro.go.kr/image/stored.jpg",
      matchScore: 95,
      matchType: "direct",
      sourceApi: "nongsaro.cropEbook.videoList",
      judgedBy: "gemini",
    });
    expect(getCropEbookVideosForCropMock).not.toHaveBeenCalled();
    expect(analyzeWithGeminiMock).not.toHaveBeenCalled();
  });

  it("keys persisted recommendations by the schedule screen month", async () => {
    const mayKey = buildWorkVideoRecommendationKey({ ...input, scheduleMonth: 5 });
    const juneKey = buildWorkVideoRecommendationKey({ ...input, scheduleMonth: 6 });

    expect(mayKey).not.toBe(juneKey);
  });

  it("reuses legacy persisted recommendations when their fetched month matches the screen month", async () => {
    const legacyKey = [
      input.cropName,
      input.scheduleSourceId,
      input.workItem,
      input.infoType,
      input.periodLabel,
      input.farmWorkFlag,
    ].join("|");
    recommendationStore.rows = [
      {
        field_id: "field-1",
        work_item_key: legacyKey,
        crop_name: "peach",
        sub_category_code: "PEACH",
        schedule_source_id: "30662",
        work_item: "flower thinning",
        work_item_period: "April-May",
        video_title: "Legacy May peach thinning",
        video_origin_instt: "RDA",
        video_link: "https://example.test/legacy-may",
        video_img: null,
        match_score: 95,
        match_type: "direct",
        reason: "Stored before scheduleMonth was added.",
        source_api: "nongsaro.cropEbook.videoList",
        judged_by: "gemini",
        fetched_at: "2026-05-08T00:00:00.000Z",
      },
    ];

    const result = await getWorkVideoRecommendationsForEra(input);

    expect(result.map((item) => item.videoTitle)).toEqual(["Legacy May peach thinning"]);
    expect(getCropEbookVideosForCropMock).not.toHaveBeenCalled();
    expect(analyzeWithGeminiMock).not.toHaveBeenCalled();
  });

  it("parses Gemini match types and scores from generateContent JSON", () => {
    const parsed = parseWorkVideoJudgementFromGeminiResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  recommendations: [
                    {
                      videoLink: "https://example.test/direct",
                      matchType: "direct",
                      matchScore: 94,
                      reason: "The video directly matches the work item.",
                    },
                    {
                      videoLink: "https://example.test/reference",
                      matchType: "reference",
                      matchScore: 78,
                      reason: "The video helps explain the work item.",
                    },
                    {
                      videoLink: "https://example.test/low",
                      matchType: "low",
                      matchScore: 40,
                      reason: "The crop matches but the work item does not.",
                    },
                    {
                      videoLink: "https://example.test/exclude",
                      matchType: "exclude",
                      matchScore: 0,
                      reason: "The video is unrelated.",
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    });

    expect(parsed.map((item) => item.matchType)).toEqual(["direct", "reference", "low", "exclude"]);
    expect(parsed.map((item) => item.matchScore)).toEqual([94, 78, 40, 0]);
  });

  it("filters out low, exclude, and below-threshold recommendations from UI display", () => {
    const visible = filterVisibleWorkVideoRecommendations([
      { matchScore: 90, matchType: "direct" },
      { matchScore: 70, matchType: "reference" },
      { matchScore: 95, matchType: "low" },
      { matchScore: 69, matchType: "reference" },
      { matchScore: 100, matchType: "exclude" },
    ]);

    expect(visible.map((item) => item.matchScore)).toEqual([90, 70]);
  });

  it("stores the full Gemini judgement result while the UI can later filter visible videos", async () => {
    getCropEbookVideosForCropMock.mockResolvedValueOnce({
      cropName: "peach",
      canonicalName: "peach",
      subCategoryCode: "PEACH",
      subCategoryName: "peach",
      videos: [
        {
          videoTitle: "Peach flower thinning",
          videoOriginInstt: "RDA",
          videoLink: "https://example.test/direct",
          videoImg: "https://example.test/direct.jpg",
        },
        {
          videoTitle: "Peach flowering management",
          videoOriginInstt: "RDA",
          videoLink: "https://example.test/reference",
          videoImg: "https://example.test/reference.jpg",
        },
        {
          videoTitle: "Peach variety overview",
          videoOriginInstt: "RDA",
          videoLink: "https://example.test/low",
          videoImg: "https://example.test/low.jpg",
        },
        {
          videoTitle: "Apple storage management",
          videoOriginInstt: "RDA",
          videoLink: "https://example.test/exclude",
          videoImg: "https://example.test/exclude.jpg",
        },
      ],
    });
    analyzeWithGeminiMock.mockResolvedValueOnce({
      source: "gemini",
      model: "gemini-3-flash-preview",
      fetchedAt: "2026-05-08T00:00:00.000Z",
      data: {
        recommendations: [
          {
            videoLink: "https://example.test/direct",
            matchType: "direct",
            matchScore: 94,
            reason: "The title directly matches the work item.",
          },
          {
            videoLink: "https://example.test/reference",
            matchType: "reference",
            matchScore: 78,
            reason: "The video helps understand the work item.",
          },
          {
            videoLink: "https://example.test/low",
            matchType: "low",
            matchScore: 35,
            reason: "Only the crop matches.",
          },
          {
            videoLink: "https://example.test/exclude",
            matchType: "exclude",
            matchScore: 0,
            reason: "The video is unrelated.",
          },
          {
            videoLink: "https://example.test/not-a-candidate",
            matchType: "direct",
            matchScore: 99,
            reason: "This fabricated candidate must be ignored.",
          },
        ],
      },
    });

    const result = await getWorkVideoRecommendationsForEra(input);

    expect(recommendationStore.upserts).toHaveLength(1);
    expect(recommendationStore.upserts[0]).toHaveLength(4);
    expect(recommendationStore.upserts[0][0]).toMatchObject({
      crop_name: "peach",
      work_item: "flower thinning",
      work_item_period: "April-May",
      source_api: "nongsaro.cropEbook.videoList",
      judged_by: "gemini",
    });
    expect(recommendationStore.upserts[0].map((row) => row.match_type)).toEqual([
      "direct",
      "reference",
      "low",
      "exclude",
    ]);
    expect(filterVisibleWorkVideoRecommendations(result).map((item) => item.videoLink)).toEqual([
      "https://example.test/direct",
      "https://example.test/reference",
    ]);
  });

  it("bypasses stored recommendations and replaces them when forceRefresh is true", async () => {
    recommendationStore.rows = [
      {
        field_id: "field-1",
        work_item_key: workItemKey,
        crop_name: "peach",
        sub_category_code: "PEACH",
        schedule_source_id: "30662",
        work_item: "flower thinning",
        work_item_period: "April-May",
        video_title: "Old stored video",
        video_origin_instt: "RDA",
        video_link: "https://example.test/old",
        video_img: null,
        match_score: 95,
        match_type: "direct",
        reason: "Old judgement.",
        source_api: "nongsaro.cropEbook.videoList",
        judged_by: "gemini",
        fetched_at: "2026-05-08T00:00:00.000Z",
      },
    ];
    getCropEbookVideosForCropMock.mockResolvedValueOnce({
      cropName: "peach",
      canonicalName: "peach",
      subCategoryCode: "PEACH",
      subCategoryName: "peach",
      videos: [
        {
          videoTitle: "Fresh peach thinning",
          videoOriginInstt: "RDA",
          videoLink: "https://example.test/fresh",
          videoImg: null,
        },
      ],
    });
    analyzeWithGeminiMock.mockResolvedValueOnce({
      source: "gemini",
      model: "gemini-3-flash-preview",
      fetchedAt: "2026-05-08T01:00:00.000Z",
      data: {
        recommendations: [
          {
            videoLink: "https://example.test/fresh",
            matchType: "direct",
            matchScore: 96,
            reason: "Fresh judgement.",
          },
        ],
      },
    });

    const result = await getWorkVideoRecommendationsForEra({ ...input, forceRefresh: true });

    expect(getCropEbookVideosForCropMock).toHaveBeenCalledWith("peach", { numOfRows: 20, maxPages: 3 });
    expect(analyzeWithGeminiMock).toHaveBeenCalledTimes(1);
    expect(recommendationStore.deletes).toEqual([{ field_id: "field-1", work_item_key: workItemKey }]);
    expect(result.map((item) => item.videoTitle)).toEqual(["Fresh peach thinning"]);
  });

  it("treats an empty videoList result as no related videos without calling Gemini", async () => {
    getCropEbookVideosForCropMock.mockResolvedValueOnce({
      cropName: "peach",
      canonicalName: "peach",
      subCategoryCode: "PEACH",
      subCategoryName: "peach",
      videos: [],
    });

    const result = await getWorkVideoRecommendationsForEra(input);

    expect(result).toEqual([]);
    expect(analyzeWithGeminiMock).not.toHaveBeenCalled();
    expect(recommendationStore.upserts).toHaveLength(0);
  });

  it("requests Gemini structured output with the REST responseSchema field", async () => {
    getCropEbookVideosForCropMock.mockResolvedValueOnce({
      cropName: "peach",
      canonicalName: "peach",
      subCategoryCode: "PEACH",
      subCategoryName: "peach",
      videos: [
        {
          videoTitle: "Peach flower thinning",
          videoOriginInstt: "RDA",
          videoLink: "https://example.test/direct",
          videoImg: null,
        },
      ],
    });
    analyzeWithGeminiMock.mockResolvedValueOnce({
      source: "gemini",
      model: "gemini-3-flash-preview",
      fetchedAt: "2026-05-08T00:00:00.000Z",
      data: {
        recommendations: [
          {
            videoLink: "https://example.test/direct",
            matchType: "direct",
            matchScore: 95,
            reason: "The title directly matches the work item.",
          },
        ],
      },
    });

    await getWorkVideoRecommendationsForEra(input);

    expect(analyzeWithGeminiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: expect.objectContaining({
          responseMimeType: "application/json",
          responseSchema: expect.objectContaining({
            type: "OBJECT",
          }),
          maxOutputTokens: 12000,
          thinkingConfig: { thinkingBudget: 0 },
        }),
      }),
      expect.any(Object),
    );
    expect(analyzeWithGeminiMock.mock.calls[0][0].generationConfig).not.toHaveProperty("responseJsonSchema");
  });

  it("reuses the crop video lookup across concurrent work items for the same crop", async () => {
    getCropEbookVideosForCropMock.mockResolvedValueOnce({
      cropName: "peach",
      canonicalName: "peach",
      subCategoryCode: "PEACH",
      subCategoryName: "peach",
      videos: [
        {
          videoTitle: "Peach flower thinning",
          videoOriginInstt: "RDA",
          videoLink: "https://example.test/direct",
          videoImg: null,
        },
      ],
    });
    analyzeWithGeminiMock.mockResolvedValue({
      source: "gemini",
      model: "gemini-3-flash-preview",
      fetchedAt: "2026-05-08T00:00:00.000Z",
      data: {
        recommendations: [
          {
            videoLink: "https://example.test/direct",
            matchType: "direct",
            matchScore: 95,
            reason: "The title directly matches the work item.",
          },
        ],
      },
    });

    await Promise.all([
      getWorkVideoRecommendationsForEra(input),
      getWorkVideoRecommendationsForEra({ ...input, workItem: "fruit thinning" }),
    ]);

    expect(getCropEbookVideosForCropMock).toHaveBeenCalledTimes(1);
    expect(analyzeWithGeminiMock).toHaveBeenCalledTimes(2);
  });
});
