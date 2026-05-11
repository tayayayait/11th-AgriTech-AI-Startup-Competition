import { describe, expect, it } from "vitest";
import { resolveNpmsCropProfile } from "@/domain/npms/cropCodes";

describe("NCPMS crop code mapping", () => {
  it("maps tomato to the NCPMS tomato crop code", () => {
    expect(resolveNpmsCropProfile("토마토")).toEqual({
      cropCode: "VC010803",
      cropName: "토마토",
    });
  });

  it("maps watermelon field labels to the NCPMS watermelon crop code", () => {
    expect(resolveNpmsCropProfile("수박")).toEqual({
      cropCode: "VC010801",
      cropName: "수박",
    });
    expect(resolveNpmsCropProfile("전라북도 고창 수박밭")).toEqual({
      cropCode: "VC010801",
      cropName: "수박",
    });
  });

  it("maps perilla leaf labels to the NCPMS perilla crop code", () => {
    expect(resolveNpmsCropProfile("깻잎")).toEqual({
      cropCode: "IC011602",
      cropName: "들깨",
    });
    expect(resolveNpmsCropProfile("들깨")).toEqual({
      cropCode: "IC011602",
      cropName: "들깨",
    });
  });

  it("maps paddy field labels to rice paddy", () => {
    expect(resolveNpmsCropProfile("논")).toEqual({
      cropCode: "FC010101",
      cropName: "논벼",
    });
    expect(resolveNpmsCropProfile("벼")).toEqual({
      cropCode: "FC010101",
      cropName: "논벼",
    });
  });

  it("maps peach field labels to the NCPMS peach crop code", () => {
    expect(resolveNpmsCropProfile("복숭아")).toEqual({
      cropCode: "FT020604",
      cropName: "복숭아",
    });
    expect(resolveNpmsCropProfile("경상북도 구미시 복숭아밭")).toEqual({
      cropCode: "FT020604",
      cropName: "복숭아",
    });
  });

  it("returns null for unsupported crops instead of guessing", () => {
    expect(resolveNpmsCropProfile("새작물")).toBeNull();
  });
});
