import {
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

const GEMINI_BASE_URL = Deno.env.get("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com";
const DEFAULT_GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3-flash-preview";

interface GeminiProxyRequest {
  model?: string;
  contents: unknown[];
  generationConfig?: Record<string, unknown>;
  safetySettings?: unknown[];
  tools?: unknown[];
  systemInstruction?: unknown;
}

function validateModelName(model: string): string {
  const safe = model.trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(safe)) {
    throw new ProxyError(400, "Invalid Gemini model name.", "invalid_model_name");
  }
  return safe;
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    ensureMethod(request, ["POST"]);
    const body = await readJson<GeminiProxyRequest>(request);

    if (!Array.isArray(body.contents) || body.contents.length === 0) {
      throw new ProxyError(400, "contents must be a non-empty array.", "invalid_contents");
    }

    const model = validateModelName(body.model ?? DEFAULT_GEMINI_MODEL);
    const apiKey = requireEnv("GEMINI_API_KEY");
    const base = GEMINI_BASE_URL.endsWith("/") ? GEMINI_BASE_URL : `${GEMINI_BASE_URL}/`;
    const url = new URL(`v1beta/models/${model}:generateContent`, base);
    url.searchParams.set("key", apiKey);

    const payload = {
      contents: body.contents,
      generationConfig: body.generationConfig,
      safetySettings: body.safetySettings,
      tools: body.tools,
      systemInstruction: body.systemInstruction,
    };

    const upstream = await fetchWithTimeout(
      url.toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      },
      20000,
    );

    const upstreamBody = await readUpstreamBody(upstream);
    if (!upstream.ok) {
      throw new ProxyError(upstream.status, "Gemini API request failed.", "gemini_upstream_error", upstreamBody);
    }

    return jsonResponse(200, {
      source: "gemini",
      model,
      fetchedAt: new Date().toISOString(),
      data: upstreamBody,
    });
  } catch (error) {
    return handleProxyError(error);
  }
});
