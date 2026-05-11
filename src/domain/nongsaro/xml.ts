export interface NongsaroParsedResponse {
  resultCode: string;
  resultMsg: string;
  items: Array<Record<string, string>>;
}

function extractRawXml(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return null;

  const source = raw as Record<string, unknown>;
  if (typeof source.raw === "string") return source.raw;
  if (typeof source.xml === "string") return source.xml;
  return null;
}

function textFromNode(node: Element | null): string {
  if (!node) return "";
  return node.textContent?.trim() ?? "";
}

function parseItem(item: Element): Record<string, string> {
  const mapped: Record<string, string> = {};
  Array.from(item.children).forEach((child) => {
    const key = child.tagName.trim();
    if (!key) return;
    mapped[key] = textFromNode(child);
  });
  return mapped;
}

function parseXml(xmlText: string): XMLDocument {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("농사로 XML 파싱에 실패했습니다.");
  }
  return doc;
}

function readResultCode(doc: XMLDocument): string {
  const resultCode =
    textFromNode(doc.querySelector("response > header > resultCode")) ||
    textFromNode(doc.querySelector("resultCode"));

  return resultCode || "00";
}

function readResultMsg(doc: XMLDocument): string {
  const resultMsg =
    textFromNode(doc.querySelector("response > header > resultMsg")) ||
    textFromNode(doc.querySelector("resultMsg"));

  return resultMsg || "";
}

function mapNongsaroCodeMessage(code: string, resultMsg: string): string {
  if (code === "11") return "농사로 API Key 설정이 올바르지 않습니다.";
  if (code === "12") return "농사로 API 키가 중지 상태입니다.";
  if (code === "13") return "농사로 서비스명 또는 오퍼레이션명이 올바르지 않습니다.";
  if (code === "15") return "농사로 도메인 인증 조건을 만족하지 못했습니다.";
  if (code === "91") return "농사로 시스템 오류가 발생했습니다.";
  if (resultMsg) return `농사로 오류: ${resultMsg}`;
  return "농사로 응답 오류가 발생했습니다.";
}

export function parseNongsaroResponse(raw: unknown): NongsaroParsedResponse {
  const xmlText = extractRawXml(raw);
  if (!xmlText) {
    throw new Error("농사로 응답에 XML 본문이 없습니다.");
  }

  const doc = parseXml(xmlText);
  const resultCode = readResultCode(doc);
  const resultMsg = readResultMsg(doc);

  if (resultCode !== "00") {
    throw new Error(mapNongsaroCodeMessage(resultCode, resultMsg));
  }

  const items = Array.from(doc.querySelectorAll("item")).map(parseItem);
  return {
    resultCode,
    resultMsg,
    items,
  };
}
