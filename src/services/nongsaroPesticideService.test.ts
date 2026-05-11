import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNongsaroAgchmSafeManualList } from "@/services/nongsaroClient";
import { getPesticideSafetyGuides } from "@/services/nongsaroPesticideService";

vi.mock("@/services/nongsaroClient", () => ({
  fetchNongsaroAgchmSafeManualList: vi.fn(),
}));

const fetchListMock = vi.mocked(fetchNongsaroAgchmSafeManualList);

const response = (items: Array<Record<string, string>>) => ({
  source: "nongsaro" as const,
  serviceName: "agchmSafeManual",
  operationName: "agchmSafeManualList",
  fetchedAt: "2026-05-06T00:00:00.000Z",
  data: { resultCode: "00", resultMsg: "OK", items },
  resultCode: "00",
  resultMsg: "OK",
  items,
});

describe("getPesticideSafetyGuides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to crop-only agchmSafeManualList when candidate keyword returns no official document", async () => {
    fetchListMock
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([
        {
          cntntsNo: "safe-1",
          cntntsSj: "벼 농약안전사용지침",
          prdlstCodeNm: "벼",
          reformYm: "2026-01",
          nationCodeNm: "대한민국",
          fileNm: "rice.pdf",
          fileUrl: "/portal/contentsFileDownload.do?ep=rice",
        },
      ]));

    const guides = await getPesticideSafetyGuides({
      cropName: "벼",
      titleKeyword: "깨씨무늬병",
    });

    expect(fetchListMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      sPrdlstCodeNm: "벼",
      sCntntsSj: "깨씨무늬병",
    }));
    expect(fetchListMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      sPrdlstCodeNm: "벼",
      sCntntsSj: undefined,
    }));
    expect(guides[0]).toMatchObject({
      sourceId: "safe-1",
      title: "벼 농약안전사용지침",
      fileUrl: expect.stringContaining("/portal/contentsFileDownload.do?ep=rice"),
    });
  });
});
