import { describe, expect, it } from "vitest";
import { normalizeHtmlSingleLineText, normalizeHtmlText } from "@/domain/text/html";

describe("HTML text normalization", () => {
  it("turns raw and escaped br tags into clean text", () => {
    expect(normalizeHtmlText("세포분열기<br/>(과실비대1기)")).toBe("세포분열기\n(과실비대1기)");
    expect(normalizeHtmlSingleLineText("세포분열기&lt;br/&gt;(과실비대1기)")).toBe(
      "세포분열기 (과실비대1기)",
    );
  });

  it("strips tags and decodes common entities", () => {
    expect(normalizeHtmlSingleLineText("<p>배수&nbsp;&amp;&nbsp;환기</p>")).toBe("배수 & 환기");
  });
});
