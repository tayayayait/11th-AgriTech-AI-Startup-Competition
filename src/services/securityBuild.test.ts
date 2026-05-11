import { describe, expect, it } from "vitest";

const SERVER_ONLY_ENV_NAMES = [
  "NONGSARO_API_KEY",
  "NONGSARO_CROP_EBOOK_API_KEY",
  "NONGSARO_BASE_URL",
  "KMA_SERVICE_KEY",
  "KMA_BASE_URL",
  "FARMMAP_API_KEY",
  "FARMMAP_BASE_URL",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_BASE_URL",
] as const;

describe("frontend environment boundary", () => {
  it("does not reference server-only env names from frontend source", async () => {
    const modules = import.meta.glob([
      "/src/**/*.{ts,tsx}",
      "!/src/**/*.test.{ts,tsx}",
    ], {
      query: "?raw",
      import: "default",
      eager: true,
    });

    const offenders = Object.entries(modules).flatMap(([path, raw]) => {
      const source = String(raw);
      return SERVER_ONLY_ENV_NAMES
        .filter((name) => source.includes(name))
        .map((name) => `${path}:${name}`);
    });

    expect(offenders).toEqual([]);
  });
});
