import {
  buildQueryString,
  ensureMethod,
  fetchWithTimeout,
  handleCors,
  handleProxyError,
  jsonResponse,
  ProxyError,
  readJson,
  requireEnv,
} from "@shared/http.ts";

const PSIS_BASE_URL = Deno.env.get("PSIS_BASE_URL") ?? "https://psis.rda.go.kr/openApi/service.do";

const ALLOWED_SERVICE_CODES = new Set(["SVC01", "SVC02"]);

type RequestParams = Record<string, string | number | boolean | null | undefined>;

interface PsisProxyRequest {
  serviceCode: string;
  params?: RequestParams;
}

interface XmlElement {
  tagName: string;
  children: XmlElement[];
  text: string;
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: "\"",
};

function decodeXmlText(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|apos|gt|lt|quot);/g, (entity, key: string) => {
    if (key.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    }
    if (key.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    }
    return XML_ENTITIES[key] ?? entity;
  });
}

function localTagName(tagName: string): string {
  const separatorIndex = tagName.indexOf(":");
  return separatorIndex >= 0 ? tagName.slice(separatorIndex + 1) : tagName;
}

function appendText(element: XmlElement, value: string): void {
  element.text += value;
}

function xmlText(element: XmlElement): string {
  return `${element.text}${element.children.map(xmlText).join("")}`;
}

function parseXml(raw: string): XmlElement {
  const root: XmlElement = { tagName: "__root__", children: [], text: "" };
  const stack: XmlElement[] = [root];
  const tokenPattern =
    /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<\/\s*([A-Za-z_][\w:.-]*)\s*>|<\s*([A-Za-z_][\w:.-]*)(?:\s[^<>]*)?\/\s*>|<\s*([A-Za-z_][\w:.-]*)(?:\s[^<>]*)?>|([^<]+)/g;

  for (const match of raw.matchAll(tokenPattern)) {
    const current = stack.at(-1);
    if (!current) break;

    const [, cdata, closingTag, selfClosingTag, openingTag, text] = match;

    if (cdata !== undefined) {
      appendText(current, cdata);
      continue;
    }

    if (text !== undefined) {
      appendText(current, decodeXmlText(text));
      continue;
    }

    if (selfClosingTag) {
      current.children.push({ tagName: localTagName(selfClosingTag), children: [], text: "" });
      continue;
    }

    if (openingTag) {
      const child: XmlElement = { tagName: localTagName(openingTag), children: [], text: "" };
      current.children.push(child);
      stack.push(child);
      continue;
    }

    if (closingTag) {
      const tagName = localTagName(closingTag);
      if (stack.length === 1 || stack.at(-1)?.tagName !== tagName) {
        throw new ProxyError(502, "PSIS API returned invalid XML.", "psis_invalid_xml");
      }
      stack.pop();
    }
  }

  if (stack.length !== 1) {
    throw new ProxyError(502, "PSIS API returned invalid XML.", "psis_invalid_xml");
  }

  return root;
}

function findFirstElement(element: XmlElement, tagName: string): XmlElement | null {
  for (const child of element.children) {
    if (child.tagName === tagName) return child;
    const match = findFirstElement(child, tagName);
    if (match) return match;
  }
  return null;
}

function textOf(element: XmlElement, tagName: string): string {
  const target = element.children.find((child) => child.tagName === tagName);
  return target ? xmlText(target).trim() : "";
}

function directChildren(element: XmlElement, tagName: string): XmlElement[] {
  return element.children.filter((child) => tagName === "*" || child.tagName === tagName);
}

function elementToRecord(element: XmlElement): Record<string, string> {
  return Object.fromEntries(element.children.map((child) => [child.tagName, xmlText(child).trim()]));
}

function parsePsisXml(raw: string): Record<string, unknown> {
  const document = parseXml(raw);
  const service = findFirstElement(document, "service");
  if (!service) {
    throw new ProxyError(502, "PSIS API response has no service payload.", "psis_missing_service");
  }

  const list = service.children.find((child) => child.tagName === "list");
  const items = list ? directChildren(list, "item").map(elementToRecord) : [];
  const payload: Record<string, unknown> = {};

  for (const child of directChildren(service, "*")) {
    if (child.tagName === "list") continue;
    payload[child.tagName] = xmlText(child).trim();
  }

  if (items.length > 0) {
    payload.list = items;
  }

  const errorCode = textOf(service, "errorCode");
  if (errorCode) {
    payload.errorCode = errorCode;
    payload.errorMsg = textOf(service, "errorMsg");
  }

  return { service: payload };
}

function validateServiceCode(value: string): string {
  const serviceCode = value.trim();
  if (!ALLOWED_SERVICE_CODES.has(serviceCode)) {
    throw new ProxyError(400, "Unsupported PSIS service code.", "unsupported_psis_service_code", {
      serviceCode,
    });
  }
  return serviceCode;
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    ensureMethod(request, ["POST"]);
    const body = await readJson<PsisProxyRequest>(request);

    if (typeof body.serviceCode !== "string") {
      throw new ProxyError(400, "serviceCode is required.", "missing_service_code");
    }

    const serviceCode = validateServiceCode(body.serviceCode);
    const query = buildQueryString({
      apiKey: requireEnv("PSIS_API_KEY"),
      ...(body.params ?? {}),
      serviceCode,
    });

    const url = new URL(PSIS_BASE_URL);
    url.search = query.toString();

    const upstream = await fetchWithTimeout(
      url.toString(),
      {
        method: "GET",
        headers: { Accept: "text/xml, application/xml, */*" },
      },
      15000,
    );
    const raw = await upstream.text();
    const parsedBody = parsePsisXml(raw);

    if (!upstream.ok) {
      throw new ProxyError(upstream.status, "PSIS API request failed.", "psis_upstream_error", parsedBody);
    }

    return jsonResponse(200, {
      source: "psis",
      serviceCode,
      fetchedAt: new Date().toISOString(),
      data: parsedBody,
    });
  } catch (error) {
    return handleProxyError(error);
  }
});
