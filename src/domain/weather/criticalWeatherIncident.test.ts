import { describe, expect, it } from "vitest";
import { detectCriticalWeatherIncident } from "@/domain/weather/criticalWeatherIncident";

describe("critical weather incident detection", () => {
  it("ignores ordinary weather changes", () => {
    expect(
      detectCriticalWeatherIncident({
        collectedAt: "2026-05-09T03:00:00.000Z",
        precipitation: 4,
        temperature: 24.5,
        wind: 2.5,
        humidity: 62,
      }),
    ).toBeNull();
  });

  it("creates a stable heavy rain incident key from the KST event date", () => {
    expect(
      detectCriticalWeatherIncident({
        collectedAt: "2026-05-09T03:00:00.000Z",
        precipitation: 35,
        temperature: 22,
        wind: 4,
        humidity: 92,
      }),
    ).toMatchObject({
      type: "heavy_rain",
      severity: "high",
      dateKey: "2026-05-09",
      key: "heavy_rain:2026-05-09:high",
    });
  });
});
