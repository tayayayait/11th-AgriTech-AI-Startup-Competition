import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeApiAdapter } from "@/services/api/edgeAdapter";
import { fetchNpms } from "@/services/npmsClient";

vi.mock("@/services/api/edgeAdapter", () => ({
  invokeApiAdapter: vi.fn(),
}));

const invokeApiAdapterMock = vi.mocked(invokeApiAdapter);

describe("fetchNpms", () => {
  beforeEach(() => {
    invokeApiAdapterMock.mockReset();
  });

  it("calls the NCPMS proxy without exposing apiKey from the browser", async () => {
    invokeApiAdapterMock.mockResolvedValue({
      source: "npms",
      serviceCode: "SVC16",
      fetchedAt: "2026-05-07T09:00:00.000Z",
      data: {
        service: {
          totalCount: 1,
          list: [
            {
              cropCode: "VC010803",
              cropName: "토마토",
              divCode: "NP01",
              divName: "병",
              korName: "궤양병",
              detailUrl: "serviceCode=SVC05&sickKey=D00004102",
            },
          ],
        },
      },
    });

    const response = await fetchNpms("SVC16", {
      serviceType: "AA003",
      cropCode: "VC010803",
      divCode: "NP01",
    });

    expect(invokeApiAdapterMock).toHaveBeenCalledWith("npms", "npms-proxy", {
      serviceCode: "SVC16",
      params: {
        serviceType: "AA003",
        cropCode: "VC010803",
        divCode: "NP01",
      },
    });
    expect(response.items).toEqual([
      expect.objectContaining({ cropName: "토마토", korName: "궤양병" }),
    ]);
  });
});
