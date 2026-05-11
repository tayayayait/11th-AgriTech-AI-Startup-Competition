import { describe, expect, it, vi } from "vitest";
import { runConsultationReportPrint } from "@/domain/reports/consultationReportExport";

describe("runConsultationReportPrint", () => {
  it("uses the browser print dialog so the report can be printed or saved as PDF", () => {
    const print = vi.fn();
    const toast = vi.fn();

    runConsultationReportPrint({
      print,
      toast,
    });

    expect(print).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("브라우저 인쇄 창에서 PDF 저장 또는 인쇄를 선택하세요.");
  });
});
