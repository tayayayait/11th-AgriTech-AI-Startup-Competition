import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchFarmmapAnalysisBaseByAttr,
  fetchFarmmapAnalysisBaseByPnu,
  fetchFarmmapByBjdAndLandCode,
  fetchFarmmapByPnu,
  fetchFarmmapByXY,
  fetchFarmmapRegionExtent,
} from "@/services/farmmapClient";
import {
  lookupFarmmapAnalysisByAttr,
  lookupFarmmapAnalysisByPnus,
  lookupFarmmapByBjdAndLandCode,
  lookupFarmmapByLatLng,
  lookupFarmmapByPnu,
  lookupFarmmapMapExtent,
  lookupFarmmapRegionMap,
} from "@/services/farmmapService";

vi.mock("@/services/farmmapClient", () => ({
  fetchFarmmapAnalysisBaseByAttr: vi.fn(),
  fetchFarmmapByBjdAndLandCode: vi.fn(),
  fetchFarmmapByPnu: vi.fn(),
  fetchFarmmapByXY: vi.fn(),
  fetchFarmmapRegionExtent: vi.fn(),
  fetchFarmmapAnalysisBaseByPnu: vi.fn(),
}));

const fetchFarmmapAnalysisBaseByAttrMock = vi.mocked(fetchFarmmapAnalysisBaseByAttr);
const fetchFarmmapAnalysisBaseByPnuMock = vi.mocked(fetchFarmmapAnalysisBaseByPnu);
const fetchFarmmapByBjdAndLandCodeMock = vi.mocked(fetchFarmmapByBjdAndLandCode);
const fetchFarmmapByPnuMock = vi.mocked(fetchFarmmapByPnu);
const fetchFarmmapByXYMock = vi.mocked(fetchFarmmapByXY);
const fetchFarmmapRegionExtentMock = vi.mocked(fetchFarmmapRegionExtent);

const farmmapRaw = {
  request: {
    pnu: "3611031024201550000",
  },
  output: {
    farmmapData: {
      count: 1,
      data: [
        {
          법정동주소: "세종특별자치시 연기면 수산리",
          분류명: "밭",
          대표PNU: "3611031024201550000",
          면적: 3965.0481731,
          geometry: [
            {
              type: "MultiPolygon",
              xy: [
                { x: 976554.7439, y: 1839046.0453 },
                { x: 976594.9491, y: 1838995.6959 },
                { x: 976574.5966, y: 1838949.0513 },
                { x: 976533.9207, y: 1838970.206 },
                { x: 976554.7439, y: 1839046.0453 },
              ],
            },
          ],
        },
      ],
    },
  },
};

describe("farmmapService", () => {
  beforeEach(() => {
    fetchFarmmapAnalysisBaseByAttrMock.mockReset();
    fetchFarmmapAnalysisBaseByPnuMock.mockReset();
    fetchFarmmapByBjdAndLandCodeMock.mockReset();
    fetchFarmmapByPnuMock.mockReset();
    fetchFarmmapByXYMock.mockReset();
    fetchFarmmapRegionExtentMock.mockReset();
  });

  it("normalizes a single PNU result into a selectable field candidate", async () => {
    fetchFarmmapByPnuMock.mockResolvedValue({
      source: "farmmap",
      operation: "searchPnu",
      fetchedAt: "2026-05-06T06:00:00.000Z",
      data: farmmapRaw,
    });

    const result = await lookupFarmmapByPnu("3611031024201550000");

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      pnu: "3611031024201550000",
      address: "세종특별자치시 연기면 수산리",
      legalDongAddress: "세종특별자치시 연기면 수산리",
      landClassification: "밭",
      areaM2: 3965.0481731,
    });
    expect(result.candidates[0].lat).toBeGreaterThan(36);
    expect(result.candidates[0].lng).toBeGreaterThan(127);
  });

  it("queries Farmmap XY lookup with WGS84 coordinates", async () => {
    fetchFarmmapByXYMock.mockResolvedValue({
      source: "farmmap",
      operation: "searchXY",
      fetchedAt: "2026-05-06T06:00:00.000Z",
      data: farmmapRaw,
    });

    await lookupFarmmapByLatLng(36.5483953, 127.2380545);

    expect(fetchFarmmapByXYMock).toHaveBeenCalledWith({
      x: 127.2380545,
      y: 36.5483953,
      epsg: "EPSG:4326",
      mapType: "farmmap",
      columnType: "KOR",
    });
  });

  it("queries Farmmap by legal district and land classification codes", async () => {
    fetchFarmmapByBjdAndLandCodeMock.mockResolvedValue({
      source: "farmmap",
      operation: "searchBjdAndLandCode",
      fetchedAt: "2026-05-06T06:00:00.000Z",
      data: farmmapRaw,
    });

    const result = await lookupFarmmapByBjdAndLandCode("3611034032", ["01", "02"]);

    expect(fetchFarmmapByBjdAndLandCodeMock).toHaveBeenCalledTimes(2);
    expect(fetchFarmmapByBjdAndLandCodeMock).toHaveBeenCalledWith({
      bjdCd: "3611034032",
      landCd: "01",
      mapType: "farmmap",
      columnType: "KOR",
      apiVersion: "v2",
    });
    expect(result.candidates).toHaveLength(1);
  });

  it("uses analysis attr results as PNU seeds for detailed Farmmap lookup", async () => {
    fetchFarmmapAnalysisBaseByAttrMock.mockResolvedValue({
      source: "farmmap",
      operation: "searchAnalysisBaseAttr",
      fetchedAt: "2026-05-06T06:00:00.000Z",
      data: {
        output: {
          data: [
            {
              필지고유번호: "3611031024201550000",
              지적면적: 500,
            },
          ],
        },
      },
    });
    fetchFarmmapByPnuMock.mockResolvedValue({
      source: "farmmap",
      operation: "searchPnu",
      fetchedAt: "2026-05-06T06:00:00.000Z",
      data: farmmapRaw,
    });

    const result = await lookupFarmmapAnalysisByAttr({
      bjdCd: "3611034032",
      landCodes: ["02"],
      fromBaseArea: 100,
      toBaseArea: 1000,
    });

    expect(fetchFarmmapAnalysisBaseByAttrMock).toHaveBeenCalledWith({
      bjdCd: "3611034032",
      landCd: "02",
      fromBaseArea: 100,
      toBaseArea: 1000,
      columnType: "KOR",
    });
    expect(fetchFarmmapByPnuMock).toHaveBeenCalledWith({
      pnu: "3611031024201550000",
      columnType: "KOR",
    });
    expect(result.candidates).toHaveLength(1);
  });

  it("normalizes cadastral cultivation analysis records by PNU", async () => {
    fetchFarmmapAnalysisBaseByPnuMock.mockResolvedValue({
      source: "farmmap",
      operation: "searchAnalysisBasePnu",
      fetchedAt: "2026-05-06T06:00:00.000Z",
      data: {
        output: {
          analysisData: {
            count: 1,
            data: [
              {
                pnu: "4128112400100090002",
                jimok: "전",
                basearea: 2610.1,
                farm_cnt: 2,
                farm_area: 583.8,
                farm_ratio: 22.4,
              },
            ],
          },
        },
      },
    });

    const result = await lookupFarmmapAnalysisByPnus(["4128112400100090002"]);

    expect(fetchFarmmapAnalysisBaseByPnuMock).toHaveBeenCalledWith({
      pnus: "4128112400100090002",
      columnType: "ENG",
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      pnu: "4128112400100090002",
      raw: {
        basearea: 2610.1,
        farm_cnt: 2,
        farm_area: 583.8,
        farm_ratio: 22.4,
      },
    });
  });

  it("builds a map extent from Farmmap WFS region features", async () => {
    fetchFarmmapRegionExtentMock.mockResolvedValue({
      source: "farmmap",
      operation: "searchRegionExtent",
      fetchedAt: "2026-05-06T06:00:00.000Z",
      data: {
        type: "FeatureCollection",
        features: [
          {
            geometry: {
              type: "MultiPolygon",
              coordinates: [
                [
                  [
                    [983100, 1855100],
                    [983200, 1855200],
                    [983120, 1855300],
                  ],
                ],
              ],
            },
            properties: {
              pnu: "4719025336108440000",
              stdg_addr: "경상북도 구미시 고아읍 봉한리",
              clsf_nm: "시설",
              area: 321.5,
            },
          },
        ],
      },
    });

    const extent = await lookupFarmmapMapExtent("4719000000", ["01", "02"]);

    expect(fetchFarmmapRegionExtentMock).toHaveBeenCalledWith({
      regionCode: "4719000000",
      landCd: "01,02",
      maxFeatures: 500,
    });
    expect(extent).toMatchObject({
      minX: 983100,
      minY: 1855100,
      maxX: 983200,
      maxY: 1855300,
      epsg: "EPSG:5179",
      featureCount: 1,
    });
  });

  it("normalizes Farmmap WFS region features into list candidates", async () => {
    fetchFarmmapRegionExtentMock.mockResolvedValue({
      source: "farmmap",
      operation: "searchRegionExtent",
      fetchedAt: "2026-05-06T06:00:00.000Z",
      data: {
        type: "FeatureCollection",
        features: [
          {
            geometry: {
              type: "MultiPolygon",
              coordinates: [[[[983100, 1855100], [983200, 1855200], [983120, 1855300], [983100, 1855100]]]],
            },
            properties: {
              pnu: "4719025336108440000",
              stdg_addr: "경상북도 구미시 고아읍 봉한리",
              clsf_nm: "시설",
              area: 321.5,
            },
          },
        ],
      },
    });

    const result = await lookupFarmmapRegionMap("4719000000", ["04"]);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      pnu: "4719025336108440000",
      address: "경상북도 구미시 고아읍 봉한리",
      landClassification: "시설",
      areaM2: 321.5,
    });
    expect(result.candidates[0].lat).toBeGreaterThan(35);
    expect(result.candidates[0].lng).toBeGreaterThan(127);
  });
});
