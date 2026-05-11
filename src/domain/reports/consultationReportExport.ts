export interface RunConsultationReportPrintInput {
  print: () => void;
  toast?: (message: string) => void;
}

export const CONSULTATION_REPORT_PRINT_MESSAGE =
  "브라우저 인쇄 창에서 PDF 저장 또는 인쇄를 선택하세요.";

export const runConsultationReportPrint = (input: RunConsultationReportPrintInput): void => {
  input.toast?.(CONSULTATION_REPORT_PRINT_MESSAGE);
  input.print();
};
