import { describe, expect, it } from "vitest";
import {
  MAJOR_NONGSARO_CROP_NAMES,
  getNongsaroCropSearchProfile,
} from "@/domain/nongsaro/cropMapping";

describe("Nongsaro crop search mapping", () => {
  it("maps rice to the Nongsaro paddy farming group", () => {
    const profile = getNongsaroCropSearchProfile("벼");

    expect(profile.workScheduleGroupNames).toContain("논농사");
    expect(profile.weeklyKeywords).toContain("논농사");
    expect(profile.pestKeywords).toContain("벼");
  });

  it("maps napa cabbage to vegetable fallback keywords", () => {
    const profile = getNongsaroCropSearchProfile("배추");

    expect(profile.workScheduleGroupNames).toContain("채소");
    expect(profile.weeklyKeywords).toEqual(expect.arrayContaining(["배추", "김장채소", "채소"]));
    expect(profile.pestKeywords).toEqual(expect.arrayContaining(["배추", "채소"]));
  });

  it("maps peach to the Nongsaro fruit work schedule group", () => {
    const profile = getNongsaroCropSearchProfile("복숭아");

    expect(profile.canonicalName).toBe("복숭아");
    expect(profile.workScheduleGroupNames).toEqual(["과수"]);
    expect(profile.weeklyKeywords).toEqual(expect.arrayContaining(["복숭아", "과수"]));
  });

  it("covers at least ten major crops with explicit Nongsaro group mapping", () => {
    const mapped = MAJOR_NONGSARO_CROP_NAMES.map((cropName) => getNongsaroCropSearchProfile(cropName))
      .filter((profile) => profile.workScheduleGroupNames.length > 0);

    expect(mapped.length).toBeGreaterThanOrEqual(10);
  });

  it("keeps unknown crop names as search keywords", () => {
    const profile = getNongsaroCropSearchProfile("새작물");

    expect(profile.workScheduleGroupNames).toEqual(["새작물"]);
    expect(profile.weeklyKeywords).toEqual(["새작물"]);
    expect(profile.pestKeywords).toEqual(["새작물"]);
  });
});
