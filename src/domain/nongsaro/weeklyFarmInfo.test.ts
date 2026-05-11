import { describe, expect, it } from "vitest";
import {
  getKstDateKey,
  isDateWithinWeeklyFarmInfoPeriod,
  parseWeeklyFarmInfoPeriod,
} from "@/domain/nongsaro/weeklyFarmInfo";

describe("weekly farm info period parsing", () => {
  it("parses the applied period from the subject instead of the registration date", () => {
    expect(parseWeeklyFarmInfoPeriod("주간농사정보 제 19호 (2026.5.11.~5.17.)")).toEqual({
      periodStart: "2026-05-11",
      periodEnd: "2026-05-17",
    });
  });

  it("uses the start year when the end year is omitted", () => {
    expect(parseWeeklyFarmInfoPeriod("주간농사정보 제 20호 (2026.12.28.~1.3.)")).toEqual({
      periodStart: "2026-12-28",
      periodEnd: "2026-01-03",
    });
  });

  it("accepts an explicit end year", () => {
    expect(parseWeeklyFarmInfoPeriod("주간농사정보 제 1호 (2026.12.28.~2027.1.3.)")).toEqual({
      periodStart: "2026-12-28",
      periodEnd: "2027-01-03",
    });
  });

  it("returns null when the title has no usable period", () => {
    expect(parseWeeklyFarmInfoPeriod("주간농사정보 최신호")).toBeNull();
    expect(parseWeeklyFarmInfoPeriod("주간농사정보 (2026.5.40.~5.47.)")).toBeNull();
  });

  it("checks current exposure using periodStart and periodEnd", () => {
    const period = parseWeeklyFarmInfoPeriod("주간농사정보 제 19호 (2026.5.11.~5.17.)");

    expect(isDateWithinWeeklyFarmInfoPeriod("2026-05-10", period)).toBe(false);
    expect(isDateWithinWeeklyFarmInfoPeriod("2026-05-11", period)).toBe(true);
    expect(isDateWithinWeeklyFarmInfoPeriod("2026-05-17", period)).toBe(true);
    expect(isDateWithinWeeklyFarmInfoPeriod("2026-05-18", period)).toBe(false);
  });

  it("formats the current key in Korea time", () => {
    expect(getKstDateKey(new Date("2026-05-07T15:30:00.000Z"))).toBe("2026-05-08");
  });
});
