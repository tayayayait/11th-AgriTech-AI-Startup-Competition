import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeApiAdapter } from "@/services/api/edgeAdapter";
import { fetchNongsaro } from "@/services/nongsaroClient";

vi.mock("@/services/api/edgeAdapter", () => ({
  invokeApiAdapter: vi.fn(),
}));

const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);

describe("fetchNongsaro", () => {
  beforeEach(() => {
    invokeApiAdapterMock.mockReset();
  });

  it("returns parsed Nongsaro items behind the adapter boundary", async () => {
    invokeApiAdapterMock.mockResolvedValue({
      source: "nongsaro",
      serviceName: "weekFarmInfo",
      operationName: "weekFarmInfoList",
      fetchedAt: "2026-05-06T06:00:00.000Z",
      data: {
        raw: `
          <response>
            <header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header>
            <body>
              <items>
                <item><subject>주간농사</subject><writerNm>농촌진흥청</writerNm></item>
              </items>
            </body>
          </response>
        `,
      },
    });

    const response = await fetchNongsaro("weekFarmInfo", "weekFarmInfoList", { pageNo: 1 });

    expect(invokeApiAdapterMock).toHaveBeenCalledWith("nongsaro", "nongsaro-proxy", {
      serviceName: "weekFarmInfo",
      operationName: "weekFarmInfoList",
      params: { pageNo: 1 },
    });
    expect(response.items).toEqual([{ subject: "주간농사", writerNm: "농촌진흥청" }]);
    expect(response.data.resultCode).toBe("00");
  });
});

