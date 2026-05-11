import { describe, expect, it } from "vitest";
import { parseNongsaroResponse } from "@/domain/nongsaro/xml";

describe("parseNongsaroResponse", () => {
  it("parses successful item fields from Nongsaro XML", () => {
    const parsed = parseNongsaroResponse({
      raw: `
        <response>
          <header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header>
          <body>
            <items>
              <item><cntntsNo>1</cntntsNo><cntntsSj>배추 병해충 정보</cntntsSj></item>
            </items>
          </body>
        </response>
      `,
    });

    expect(parsed.resultCode).toBe("00");
    expect(parsed.items).toEqual([{ cntntsNo: "1", cntntsSj: "배추 병해충 정보" }]);
  });

  it("treats a successful response with no item as an empty result", () => {
    const parsed = parseNongsaroResponse({
      raw: `
        <response>
          <header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header>
          <body><items /></body>
        </response>
      `,
    });

    expect(parsed.resultCode).toBe("00");
    expect(parsed.items).toEqual([]);
  });

  it("throws for Nongsaro error result codes", () => {
    expect(() =>
      parseNongsaroResponse({
        raw: `
          <response>
            <header><resultCode>11</resultCode><resultMsg>INVALID KEY</resultMsg></header>
          </response>
        `,
      }),
    ).toThrow("API Key");
  });
});
