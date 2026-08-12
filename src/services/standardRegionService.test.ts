import { beforeEach, describe, expect, it, vi } from "vitest";
import { toApiAdapterError } from "@/services/api/errors";
import { EdgeInvokeError } from "@/services/edgeInvoke";
import { fetchStandardRegionCodes } from "@/services/standardRegionClient";
import { getAllStandardRegionCodes } from "@/services/standardRegionService";

vi.mock("@/services/standardRegionClient", () => ({
  fetchStandardRegionCodes: vi.fn(),
}));

const fetchStandardRegionCodesMock = vi.mocked(fetchStandardRegionCodes);

function upstreamError(message: string, details: unknown) {
  return toApiAdapterError(new EdgeInvokeError(message, {
    code: "standard_region_upstream_error",
    details,
  }), "standardRegion");
}

describe("getAllStandardRegionCodes", () => {
  beforeEach(() => {
    fetchStandardRegionCodesMock.mockReset();
  });

  it("paces paginated requests so the public API rate limit is not exhausted", async () => {
    let activeRequests = 0;
    let peakActiveRequests = 0;
    let now = 0;
    const requestStartedAt: number[] = [];

    fetchStandardRegionCodesMock.mockImplementation(async (params) => {
      activeRequests += 1;
      peakActiveRequests = Math.max(peakActiveRequests, activeRequests);
      requestStartedAt.push(now);

      await Promise.resolve();
      activeRequests -= 1;

      const pageNo = Number(params?.pageNo ?? 1);
      return {
        source: "standardRegion",
        operation: "list",
        fetchedAt: "2026-08-12T00:00:00.000Z",
        data: {
          totalCount: 3000,
          pageNo,
          numOfRows: 1000,
          rows: [],
        },
      };
    });

    await getAllStandardRegionCodes({
      minRequestIntervalMs: 100,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
    });

    expect(fetchStandardRegionCodesMock.mock.calls.map(([params]) => params?.pageNo)).toEqual([1, 2, 3]);
    expect(peakActiveRequests).toBe(1);
    expect(requestStartedAt).toEqual([0, 100, 200]);
  });

  it("retries only the page rejected by the upstream per-second limit", async () => {
    const sleepCalls: number[] = [];

    fetchStandardRegionCodesMock
      .mockResolvedValueOnce({
        source: "standardRegion",
        operation: "list",
        fetchedAt: "2026-08-12T00:00:00.000Z",
        data: { totalCount: 2000, pageNo: 1, numOfRows: 1000, rows: [] },
      })
      .mockRejectedValueOnce(upstreamError("Rate limited", {
        OpenAPI_ServiceResponse: {
          cmmMsgHeader: {
            errMsg: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR",
            returnReasonCode: "23",
          },
        },
      }))
      .mockResolvedValueOnce({
        source: "standardRegion",
        operation: "list",
        fetchedAt: "2026-08-12T00:00:01.000Z",
        data: { totalCount: 2000, pageNo: 2, numOfRows: 1000, rows: [] },
      });

    await getAllStandardRegionCodes({
      minRequestIntervalMs: 100,
      sleep: async (milliseconds) => {
        sleepCalls.push(milliseconds);
      },
    });

    expect(fetchStandardRegionCodesMock.mock.calls.map(([params]) => params?.pageNo)).toEqual([1, 2, 2]);
    expect(sleepCalls).toEqual([100, 1000]);
  });

  it("does not retry daily-quota errors as if they were per-second limits", async () => {
    fetchStandardRegionCodesMock.mockRejectedValueOnce(upstreamError("Daily quota exhausted", {
      OpenAPI_ServiceResponse: {
        cmmMsgHeader: {
          errMsg: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR",
          returnReasonCode: "22",
        },
      },
    }));

    await expect(getAllStandardRegionCodes({ sleep: vi.fn() })).rejects.toThrow("Daily quota exhausted");
    expect(fetchStandardRegionCodesMock).toHaveBeenCalledTimes(1);
  });

  it("recognizes the public API's XML form of the per-second limit error", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);

    fetchStandardRegionCodesMock
      .mockRejectedValueOnce(upstreamError("Rate limited", {
        raw: `
          <OpenAPI_ServiceResponse><cmmMsgHeader>
            <errMsg>SERVICE ERROR</errMsg>
            <returnAuthMsg>초당 서비스 요청제한 횟수 초과 에러</returnAuthMsg>
            <returnReasonCode>23</returnReasonCode>
          </cmmMsgHeader></OpenAPI_ServiceResponse>
        `,
      }))
      .mockResolvedValueOnce({
        source: "standardRegion",
        operation: "list",
        fetchedAt: "2026-08-12T00:00:01.000Z",
        data: { totalCount: 0, pageNo: 1, numOfRows: 1000, rows: [] },
      });

    await getAllStandardRegionCodes({ sleep });

    expect(fetchStandardRegionCodesMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });
});
