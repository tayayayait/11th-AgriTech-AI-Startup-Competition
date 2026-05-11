import { describe, expect, it } from "vitest";
import {
  buildFarmmapClassificationCqlFilter,
  buildFarmmapMarkerOptions,
  buildFarmmapPolygonOptions,
  buildFarmmapPolygonStyle,
  farmmapFieldMatchesLandCodes,
  getFarmmapPolygonCoordinates,
  getFarmmapPolygonExtent,
  hasValidFarmmapCoordinate,
} from "@/domain/farmmap/map";

describe("farmmap map helpers", () => {
  it("accepts valid Korean WGS84 coordinates", () => {
    expect(hasValidFarmmapCoordinate({ lat: 36.1195, lng: 128.3446 })).toBe(true);
  });

  it("rejects missing or out-of-range coordinates", () => {
    expect(hasValidFarmmapCoordinate({ lat: Number.NaN, lng: 128.3446 })).toBe(false);
    expect(hasValidFarmmapCoordinate({ lat: 41, lng: 128.3446 })).toBe(false);
    expect(hasValidFarmmapCoordinate({ lat: 36.1195, lng: 140 })).toBe(false);
  });

  it("builds Farmmap marker options with EPSG:4326 coordinates", () => {
    const marker = buildFarmmapMarkerOptions(
      {
        id: "field-1",
        name: "포도",
        crop_name: "포도",
        risk_level: "low",
        risk_score: 12,
        lat: 36.1195,
        lng: 128.3446,
      },
      "https://example.test/marker.png",
    );

    expect(marker).toMatchObject({
      id: "field-field-1",
      iconUrl: "https://example.test/marker.png",
      x: 128.3446,
      y: 36.1195,
      epsg: "EPSG:4326",
    });
    expect(marker.data).toMatchObject({
      name: "포도",
      cropName: "포도",
      riskScore: 12,
    });
  });

  it("extracts Farmmap polygon coordinates from API geometry", () => {
    const coordinates = getFarmmapPolygonCoordinates({
      farmmap_meta: {
        raw: {
          geometry: [
            {
              xy: [
                { x: "982500.764", y: "1832837.759" },
                { x: 982558.139, y: 1832900.744 },
                { x: 982600.469, y: 1832833.424 },
              ],
            },
          ],
        },
      },
    });

    expect(coordinates).toEqual([
      { x: 982500.764, y: 1832837.759 },
      { x: 982558.139, y: 1832900.744 },
      { x: 982600.469, y: 1832833.424 },
    ]);
  });

  it("builds an EPSG:5179 extent from Farmmap polygon coordinates", () => {
    const extent = getFarmmapPolygonExtent({
      farmmap_meta: {
        raw: {
          geometry: [
            {
              xy: [
                { x: 982500.764, y: 1832837.759 },
                { x: 982558.139, y: 1832900.744 },
                { x: 982600.469, y: 1832833.424 },
              ],
            },
          ],
        },
      },
    });

    expect(extent).toEqual({
      minX: 982500.764,
      minY: 1832833.424,
      maxX: 982600.469,
      maxY: 1832900.744,
      epsg: "EPSG:5179",
      featureCount: 1,
    });
  });

  it("styles filtered Farmmap polygons by classification", () => {
    expect(buildFarmmapPolygonStyle("\ubc2d")).toMatchObject({
      fillColor: "#d9db37",
      strokeColor: "#7f8215",
    });
  });

  it("builds a WMS CQL filter from Farmmap land codes", () => {
    expect(buildFarmmapClassificationCqlFilter(["02", "04"])).toBe("(clsf_nm='\ubc2d' OR clsf_nm='\uc2dc\uc124')");
  });

  it("adds legal-dong code to the WMS CQL filter when selected", () => {
    expect(buildFarmmapClassificationCqlFilter(["02"], "4719025621")).toBe("stdg_cd='4719025621' AND (clsf_nm='\ubc2d')");
  });

  it("uses legal-district prefixes for higher-level WMS filters", () => {
    expect(buildFarmmapClassificationCqlFilter(["02"], "4719000000")).toBe("stdg_cd >= '4719000000' AND stdg_cd <= '4719099999' AND (clsf_nm='\ubc2d')");
    expect(buildFarmmapClassificationCqlFilter(["02"], "4719025600")).toBe("stdg_cd >= '4719025600' AND stdg_cd <= '4719025699' AND (clsf_nm='\ubc2d')");
  });

  it("matches registered fields against selected Farmmap land codes", () => {
    expect(farmmapFieldMatchesLandCodes({
      crop_name: "\ub17c",
      farmmap_meta: { classification: "\ub17c" },
    }, ["02"])).toBe(false);
    expect(farmmapFieldMatchesLandCodes({
      crop_name: "\ubc2d",
      farmmap_meta: { classification: "\ubc2d" },
    }, ["02"])).toBe(true);
  });

  it("builds Farmmap polygon options for region lookup fields", () => {
    const polygon = buildFarmmapPolygonOptions({
      id: "field-1",
      name: "sample",
      crop_name: "\ubc2d",
      pnu: "3611033028105610000",
      farmmap_meta: {
        classification: "\ubc2d",
        raw: {
          geometry: [
            {
              xy: [
                { x: 982500.764, y: 1832837.759 },
                { x: 982558.139, y: 1832900.744 },
                { x: 982600.469, y: 1832833.424 },
              ],
            },
          ],
        },
      },
    });

    expect(polygon).toMatchObject({
      id: "field-polygon-field-1",
      type: "polygon",
      data: {
        pnu: "3611033028105610000",
        classification: "\ubc2d",
      },
      style: {
        fillColor: "#d9db37",
      },
    });
  });
});
