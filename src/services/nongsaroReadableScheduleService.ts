import { supabase } from "@/integrations/supabase/client";

interface ReadableScheduleDownloadInput {
  sourceUrl: string;
  sourceFileName: string | null;
  title: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function readableScheduleFileName(sourceFileName: string | null, title: string): string {
  const sourceBase = (sourceFileName ?? "").replace(/\.[^.]+$/, "").trim();
  const fallbackBase = `${title.trim() || "농작업일정"} 농작업일정`;
  const withoutControlCharacters = Array.from(sourceBase || fallbackBase)
    .map((character) => character.charCodeAt(0) < 32 ? "_" : character)
    .join("");
  const safeBase = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return `${safeBase || "농작업일정"}.html`;
}

export function buildReadableScheduleHtml(content: string, title: string): string {
  const safeTitle = escapeHtml(title.trim() || "농작업일정");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light; font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; color: #17221b; background: #eef3ef; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; }
    main { width: min(100%, 1080px); margin: 0 auto; padding: 32px; background: #fff; border: 1px solid #dbe5dd; border-radius: 16px; box-shadow: 0 12px 36px rgba(29, 62, 39, .08); }
    header { margin-bottom: 24px; padding-bottom: 18px; border-bottom: 2px solid #2f7650; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    header p { margin: 0; color: #637066; font-size: 13px; }
    p { line-height: 1.7; }
    table { width: 100%; margin: 16px 0; border-collapse: collapse; table-layout: auto; }
    th, td { min-width: 48px; padding: 8px; border: 1px solid #b9c8bc; vertical-align: middle; overflow-wrap: anywhere; }
    th { background: #edf5ef; }
    img { display: block; max-width: 100%; height: auto; margin: 12px auto; }
    @media (max-width: 640px) { body { padding: 0; } main { padding: 18px; border: 0; border-radius: 0; } }
    @media print { body { padding: 0; background: #fff; } main { width: 100%; padding: 0; border: 0; box-shadow: none; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${safeTitle}</h1>
      <p>농촌진흥청 농사로 원본 HWPX를 브라우저에서 볼 수 있도록 변환한 파일입니다.</p>
    </header>
    ${content}
  </main>
</body>
</html>`;
}

async function fetchHwpxBlob(sourceUrl: string): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke<Blob>("nongsaro-document-proxy", {
    body: { sourceUrl },
    headers: { "Content-Type": "application/json" },
  });

  if (error) throw error;
  if (!(data instanceof Blob) || data.size === 0) {
    throw new Error("농작업일정 원본 파일을 가져오지 못했습니다.");
  }
  return data;
}

export async function downloadReadableNongsaroSchedule(
  input: ReadableScheduleDownloadInput,
): Promise<string> {
  const sourceBlob = await fetchHwpxBlob(input.sourceUrl);
  const { HwpxReader } = await import("@ssabrojs/hwpxjs");
  const reader = new HwpxReader();
  await reader.loadFromArrayBuffer(await sourceBlob.arrayBuffer());
  const content = await reader.extractHtml({
    embedImages: true,
    renderImages: true,
    renderTables: true,
    renderStyles: true,
  });

  if (!content.trim()) {
    throw new Error("농작업일정 파일에서 표시할 내용을 찾지 못했습니다.");
  }

  const fileName = readableScheduleFileName(input.sourceFileName, input.title);
  const html = buildReadableScheduleHtml(content, `${input.title} 농작업일정`);
  const downloadUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(downloadUrl);
  return fileName;
}
