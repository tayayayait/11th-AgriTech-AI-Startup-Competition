import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NongsaroApiResponse } from "@/services/nongsaroClient";

vi.mock("@/services/nongsaroClient", () => ({
  fetchNongsaro: vi.fn(),
}));

import { fetchNongsaro } from "@/services/nongsaroClient";
import { getCropEbookVideosForCrop } from "@/services/cropEbookService";

const nongsaroResponse = (
  operationName: string,
  items: Array<Record<string, string>>,
): NongsaroApiResponse =>
  ({
    source: "nongsaro",
    serviceName: "cropEbook",
    operationName,
    fetchedAt: "2026-05-08T00:00:00.000Z",
    data: {} as NongsaroApiResponse["data"],
    items,
    resultCode: "00",
    resultMsg: "OK",
  }) as NongsaroApiResponse;

describe("cropEbookService", () => {
  const fetchNongsaroMock = vi.mocked(fetchNongsaro);

  beforeEach(() => {
    fetchNongsaroMock.mockReset();
  });

  it("finds a sub category for the crop and fetches multiple videoList pages without subject filtering", async () => {
    fetchNongsaroMock.mockImplementation(async (_serviceName, operationName, params) => {
      if (operationName === "mainCategoryList") {
        return nongsaroResponse(operationName, [
          { mainCategoryCode: "100", mainCategoryNm: "채소" },
          { mainCategoryCode: "200", mainCategoryNm: "과수" },
        ]);
      }

      if (operationName === "middleCategoryList") {
        if (params?.mainCategoryCode === "100") {
          return nongsaroResponse(operationName, [{ middleCategoryCode: "110", middleCategoryNm: "과채류" }]);
        }
        return nongsaroResponse(operationName, [{ middleCategoryCode: "210", middleCategoryNm: "핵과류" }]);
      }

      if (operationName === "subCategoryList") {
        if (params?.middleCategoryCode === "110") {
          return nongsaroResponse(operationName, []);
        }
        return nongsaroResponse(operationName, [
          { subCategoryCode: "PEACH", subCategoryNm: "복숭아" },
        ]);
      }

      if (operationName === "videoList") {
        expect(params).not.toHaveProperty("subject");
        expect(params?.subCategoryCode).toBe("PEACH");
        expect(params?.numOfRows).toBe(2);

        if (params?.pageNo === 1) {
          return nongsaroResponse(operationName, [
            {
              videoTitle: "복숭아 꽃솎기",
              videoOriginInstt: "농촌진흥청",
              videoLink: "https://example.test/peach-thinning",
              videoImg: "/peach-thinning.jpg",
            },
            {
              videoTitle: "복숭아 병해충 관리",
              videoOriginInstt: "농촌진흥청",
              videoLink: "https://example.test/peach-pest",
              videoImg: "https://example.test/peach-pest.jpg",
            },
          ]);
        }

        return nongsaroResponse(operationName, [
          {
            videoTitle: "복숭아 수확 후 관리",
            videoOriginInstt: "농촌진흥청",
            videoLink: "https://example.test/peach-harvest",
            videoImg: "https://example.test/peach-harvest.jpg",
          },
        ]);
      }

      throw new Error(`Unexpected operation: ${operationName}`);
    });

    const result = await getCropEbookVideosForCrop("복숭아", { numOfRows: 2, maxPages: 2 });

    expect(result.subCategoryCode).toBe("PEACH");
    expect(result.subCategoryName).toBe("복숭아");
    expect(result.videos.map((video) => video.videoTitle)).toEqual([
      "복숭아 꽃솎기",
      "복숭아 병해충 관리",
      "복숭아 수확 후 관리",
    ]);
    expect(fetchNongsaroMock).toHaveBeenCalledWith("cropEbook", "videoList", {
      subCategoryCode: "PEACH",
      pageNo: 1,
      numOfRows: 2,
    });
    expect(fetchNongsaroMock).toHaveBeenCalledWith("cropEbook", "videoList", {
      subCategoryCode: "PEACH",
      pageNo: 2,
      numOfRows: 2,
    });
  });

  it("treats a successful empty videoList response as no videos", async () => {
    fetchNongsaroMock.mockImplementation(async (_serviceName, operationName, params) => {
      if (operationName === "mainCategoryList") {
        return nongsaroResponse(operationName, [{ mainCategoryCode: "200", mainCategoryNm: "fruit" }]);
      }

      if (operationName === "middleCategoryList") {
        return nongsaroResponse(operationName, [{ middleCategoryCode: "210", middleCategoryNm: "stone fruit" }]);
      }

      if (operationName === "subCategoryList") {
        return nongsaroResponse(operationName, [{ subCategoryCode: "PEACH", subCategoryNm: "peach" }]);
      }

      if (operationName === "videoList") {
        expect(params).toMatchObject({
          subCategoryCode: "PEACH",
          pageNo: 1,
          numOfRows: 20,
        });
        return nongsaroResponse(operationName, []);
      }

      throw new Error(`Unexpected operation: ${operationName}`);
    });

    const result = await getCropEbookVideosForCrop("peach");

    expect(result.subCategoryCode).toBe("PEACH");
    expect(result.videos).toEqual([]);
  });
});
