import { describe, expect, it } from "vitest";
import {
  normalizeKmaPrecipitation,
  parseKmaItems,
  resolveKmaBaseDateTime,
  toKmaGrid,
} from "@/domain/weather/kma";

describe("KMA weather helpers", () => {
  it("converts Seoul lat/lng to the expected KMA grid", () => {
    expect(toKmaGrid(37.5665, 126.978)).toEqual({ nx: 60, ny: 127 });
  });

  it("uses the previous hour for ultra short actual before the release buffer", () => {
    const base = resolveKmaBaseDateTime("ultraSrtNcst", new Date("2026-05-06T00:05:00.000Z"));
    expect(base).toEqual({ baseDate: "20260506", baseTime: "0800" });
  });

  it("uses the previous ultra short forecast base before the 45 minute release point", () => {
    const base = resolveKmaBaseDateTime("ultraSrtFcst", new Date("2026-05-06T00:40:00.000Z"));
    expect(base).toEqual({ baseDate: "20260506", baseTime: "0830" });
  });

  it("uses the current ultra short forecast base after the 45 minute release point", () => {
    const base = resolveKmaBaseDateTime("ultraSrtFcst", new Date("2026-05-06T00:45:00.000Z"));
    expect(base).toEqual({ baseDate: "20260506", baseTime: "0930" });
  });

  it("uses the latest released village forecast base time", () => {
    const base = resolveKmaBaseDateTime("vilageFcst", new Date("2026-05-06T00:15:00.000Z"));
    expect(base).toEqual({ baseDate: "20260506", baseTime: "0800" });
  });

  it("normalizes KMA precipitation text values", () => {
    expect(normalizeKmaPrecipitation("강수없음")).toBe(0);
    expect(normalizeKmaPrecipitation("1.0mm 미만")).toBe(0.5);
    expect(normalizeKmaPrecipitation("10~20mm")).toBe(15);
  });

  it("parses KMA items and rejects upstream result codes", () => {
    const raw = {
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
        body: { items: { item: [{ category: "TMP", fcstValue: "20" }] } },
      },
    };

    expect(parseKmaItems(raw)).toEqual([{ category: "TMP", fcstValue: "20" }]);
    expect(() =>
      parseKmaItems({ response: { header: { resultCode: "03", resultMsg: "NO_DATA" } } }),
    ).toThrow("기상청 API 오류");
  });
});
