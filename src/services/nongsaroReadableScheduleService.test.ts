import { HwpxWriter } from "@ssabrojs/hwpxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildReadableScheduleHtml,
  downloadReadableNongsaroSchedule,
  readableScheduleFileName,
} from "@/services/nongsaroReadableScheduleService";

const { invokeEdgeMock } = vi.hoisted(() => ({
  invokeEdgeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeEdgeMock,
    },
  },
}));

describe("nongsaroReadableScheduleService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    invokeEdgeMock.mockReset();
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("creates a browser-readable Korean HTML document around converted HWPX content", () => {
    const html = buildReadableScheduleHtml(
      "<table><tr><td>씨뿌림</td></tr></table>",
      "배추 농작업일정",
    );

    expect(html).toContain('<html lang="ko">');
    expect(html).toContain("<title>배추 농작업일정</title>");
    expect(html).toContain("<td>씨뿌림</td>");
    expect(html).toContain("img-src data:");
  });

  it("changes the original HWPX name to a safe HTML download name", () => {
    expect(readableScheduleFileName("배추 농작업일정.hwpx", "배추")).toBe("배추 농작업일정.html");
    expect(readableScheduleFileName(null, "배추/가을")).toBe("배추_가을 농작업일정.html");
  });

  it("converts a proxied HWPX into a downloaded HTML file", async () => {
    const writer = new HwpxWriter();
    const hwpxBytes = await writer.createFromPlainText("배추 씨뿌림과 아주심기 일정", {
      title: "배추 농작업일정",
      creator: "농사로",
    });
    const sourceBlob = new Blob([hwpxBytes], { type: "application/octet-stream" });
    Object.defineProperty(sourceBlob, "arrayBuffer", {
      configurable: true,
      value: async () => hwpxBytes.buffer.slice(
        hwpxBytes.byteOffset,
        hwpxBytes.byteOffset + hwpxBytes.byteLength,
      ),
    });
    invokeEdgeMock.mockResolvedValue({
      data: sourceBlob,
      error: null,
    });
    const downloadBlobUrl = "blob:readable-schedule";
    const createObjectUrl = vi.fn(() => downloadBlobUrl);
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    const fileName = await downloadReadableNongsaroSchedule({
      sourceUrl: "https://www.nongsaro.go.kr/portal/contentsFileDownload.do?ep=test",
      sourceFileName: "배추 농작업일정.hwpx",
      title: "배추",
    });

    expect(fileName).toBe("배추 농작업일정.html");
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith(downloadBlobUrl);
  });
});
