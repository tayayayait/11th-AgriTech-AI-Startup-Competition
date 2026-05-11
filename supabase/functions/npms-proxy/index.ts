import {
  buildQueryString,
  ensureMethod,
  fetchWithTimeout,
  handleCors,
  handleProxyError,
  jsonResponse,
  ProxyError,
  readJson,
  readUpstreamBody,
  requireEnv,
} from "@shared/http.ts";

const NPMS_BASE_URL = Deno.env.get("NCPMS_BASE_URL") ?? "http://ncpms.rda.go.kr/npmsAPI/service";

const ALLOWED_SERVICE_CODES = new Set([
  "SVC05",
  "SVC07",
  "SVC13",
  "SVC16",
  "SVC41",
  "SVC42",
  "SVC51",
  "SVC52",
  "SVC53",
]);

type RequestParams = Record<string, string | number | boolean | null | undefined>;

interface NpmsProxyRequest {
  serviceCode: string;
  params?: RequestParams;
}

function scrubApiKeyFromString(value: string): string {
  if (!value.includes("apiKey=")) return value;
  return value
    .replace(/(^|[?&])apiKey=[^&]*&?/g, (_match, prefix: string) => prefix)
    .replace(/[?&]$/, "");
}

function sanitizeNpmsPayload(value: unknown): unknown {
  if (typeof value === "string") return scrubApiKeyFromString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeNpmsPayload(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeNpmsPayload(item)]),
  );
}

function parseNpmsJsonPayload(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = (value as { raw?: unknown }).raw;
  if (typeof raw !== "string") return value;

  const text = raw.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) return value;

  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function validateServiceCode(value: string): string {
  const serviceCode = value.trim();
  if (!ALLOWED_SERVICE_CODES.has(serviceCode)) {
    throw new ProxyError(400, "Unsupported NCPMS service code.", "unsupported_npms_service_code", {
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
    const body = await readJson<NpmsProxyRequest>(request);

    if (typeof body.serviceCode !== "string") {
      throw new ProxyError(400, "serviceCode is required.", "missing_service_code");
    }

    const serviceCode = validateServiceCode(body.serviceCode);
    const query = buildQueryString({
      apiKey: requireEnv("NCPMS_API_KEY"),
      ...(body.params ?? {}),
      serviceCode,
    });

    const url = new URL(NPMS_BASE_URL);
    url.search = query.toString();

    const upstream = await fetchWithTimeout(
      url.toString(),
      {
        method: "GET",
        headers: { Accept: "application/json, text/xml, */*" },
      },
      15000,
    );

    const upstreamBody = await readUpstreamBody(upstream);
    const parsedBody = parseNpmsJsonPayload(upstreamBody);
    const sanitizedBody = sanitizeNpmsPayload(parsedBody);
    if (!upstream.ok) {
      throw new ProxyError(upstream.status, "NCPMS API request failed.", "npms_upstream_error", sanitizedBody);
    }

    return jsonResponse(200, {
      source: "npms",
      serviceCode,
      fetchedAt: new Date().toISOString(),
      data: sanitizedBody,
    });
  } catch (error) {
    return handleProxyError(error);
  }
});
