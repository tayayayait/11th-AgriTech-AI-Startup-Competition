import { describe, expect, it } from "vitest";
import { centroidFromFarmmapGeometry, epsg5179ToWgs84 } from "@/domain/farmmap/projection";

describe("farmmap projection helpers", () => {
  it("converts EPSG:5179 coordinates to WGS84 using Farmmap guide sample", () => {
    const result = epsg5179ToWgs84({ x: 976555.97765681, y: 1838993.1813686 });

    expect(result.lng).toBeCloseTo(127.2380545, 5);
    expect(result.lat).toBeCloseTo(36.5483953, 5);
  });

  it("calculates a centroid from Farmmap geometry rings", () => {
    const result = centroidFromFarmmapGeometry([
      {
        xy: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 2 },
          { x: 0, y: 2 },
          { x: 0, y: 0 },
        ],
      },
    ]);

    expect(result).toEqual({ x: 1, y: 1 });
  });
});

