import {
  CORS_HEADERS,
  ensureMethod,
  fetchWithTimeout,
  handleCors,
  handleProxyError,
  ProxyError,
  readJson,
} from "@shared/http.ts";

const MAX_HWPX_BYTES = 15 * 1024 * 1024;
const ALLOWED_HOSTS = new Set(["www.nongsaro.go.kr", "nongsaro.go.kr"]);
const ALLOWED_PATH = "/portal/contentsFileDownload.do";

interface NongsaroDocumentRequest {
  sourceUrl: string;
}

function validateSourceUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProxyError(400, "sourceUrl must be a valid URL.", "invalid_source_url");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ProxyError(400, "sourceUrl protocol is not allowed.", "invalid_source_url_protocol");
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || url.pathname !== ALLOWED_PATH) {
    throw new ProxyError(400, "Only Nongsaro attachment URLs are allowed.", "invalid_source_url_host");
  }

  url.protocol = "https:";
  return url;
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && bytes[2] === 0x03
    && bytes[3] === 0x04;
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    ensureMethod(request, ["POST"]);
    const body = await readJson<NongsaroDocumentRequest>(request);
    if (typeof body.sourceUrl !== "string") {
      throw new ProxyError(400, "sourceUrl is required.", "missing_source_url");
    }

    const sourceUrl = validateSourceUrl(body.sourceUrl);
    const upstream = await fetchWithTimeout(sourceUrl.toString(), {
      headers: { Accept: "application/octet-stream, application/zip, */*" },
    }, 25000);
    if (!upstream.ok) {
      throw new ProxyError(upstream.status, "Nongsaro document download failed.", "nongsaro_document_error");
    }

    const declaredLength = Number(upstream.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_HWPX_BYTES) {
      throw new ProxyError(413, "Nongsaro document is too large.", "document_too_large");
    }

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_HWPX_BYTES) {
      throw new ProxyError(413, "Nongsaro document is empty or too large.", "invalid_document_size");
    }
    if (!looksLikeZip(bytes)) {
      throw new ProxyError(415, "Nongsaro document is not a valid HWPX file.", "unsupported_document");
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return handleProxyError(error);
  }
});
