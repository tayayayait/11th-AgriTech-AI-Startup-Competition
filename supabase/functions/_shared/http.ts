const DEFAULT_TIMEOUT_MS = 12000;
const MAX_TIMEOUT_MS = 30000;

type QueryValue = string | number | boolean | null | undefined;

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fieldguard-owner-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class ProxyError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = "proxy_error", details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function handleCors(request: Request): Response | null {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  return null;
}

export function ensureMethod(request: Request, allowed: ReadonlyArray<string>): void {
  if (!allowed.includes(request.method)) {
    throw new ProxyError(405, `Method ${request.method} is not allowed.`, "method_not_allowed");
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ProxyError(415, "Content-Type must be application/json.", "invalid_content_type");
  }

  try {
    return (await request.json()) as T;
  } catch (error) {
    throw new ProxyError(400, "Invalid JSON body.", "invalid_json", error);
  }
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new ProxyError(500, `Missing environment variable: ${name}`, "missing_env");
  }
  return value;
}

export function buildQueryString(params: Record<string, QueryValue>): URLSearchParams {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    query.set(key, String(value));
  }

  return query;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const timeout = Math.min(Math.max(timeoutMs, 1000), MAX_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ProxyError(504, "Upstream request timed out.", "upstream_timeout");
    }
    throw new ProxyError(502, "Failed to connect upstream service.", "upstream_connection_failed", error);
  } finally {
    clearTimeout(timer);
  }
}

export async function readUpstreamBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }

  if (contentType.includes("xml") || raw.trimStart().startsWith("<")) {
    return { raw };
  }

  return { raw };
}

export function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function handleProxyError(error: unknown): Response {
  if (error instanceof ProxyError) {
    return jsonResponse(error.status, {
      error: error.message,
      code: error.code,
      details: error.details ?? null,
    });
  }

  console.error("[edge-proxy] unexpected error", error);
  return jsonResponse(500, {
    error: "Unexpected server error.",
    code: "unexpected_error",
  });
}
