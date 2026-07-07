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
import { shouldReturnDegradedWeeklyBriefing } from "./errorPolicy.ts";

const GEMINI_BASE_URL = Deno.env.get("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com";
const DEFAULT_GEMINI_MODEL = Deno.env.get("GEMINI_WEEKLY_BRIEFING_MODEL") ?? "gemini-3-flash-preview";
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const PDF_FETCH_TIMEOUT_MS = 7000;
const GEMINI_REQUEST_TIMEOUT_MS = 26000;
const GEMINI_MAX_OUTPUT_TOKENS = 3000;
const ALLOWED_PDF_HOSTS = new Set([
  "api.nongsaro.go.kr",
  "www.nongsaro.go.kr",
  "nongsaro.go.kr",
  "rda.go.kr",
  "www.rda.go.kr",
]);

interface WeeklyFarmBriefingProxyRequest {
  sourceUrl: string;
  sourceTitle?: string | null;
  publishedAt?: string | null;
  cropName: string;
  cropGroup?: string | null;
  field?: {
    id?: string | null;
    name?: string | null;
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
    growthStage?: string | null;
    areaM2?: number | null;
  } | null;
  weather?: {
    sourceStatus?: string | null;
    collectedAt?: string | null;
    precipitation?: number | null;
    temperature?: number | null;
    wind?: number | null;
    humidity?: number | null;
    riskScore?: number | null;
    riskSummary?: string | null;
  } | null;
  model?: string | null;
}

interface RequestContext {
  requestId: string;
  startedAt: number;
  stage: string;
  body: WeeklyFarmBriefingProxyRequest;
  sourceUrl: URL;
  model: string;
}

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function logStage(context: RequestContext, stage: string, details: Record<string, unknown> = {}): void {
  context.stage = stage;
  console.info(JSON.stringify({
    event: "weekly_farm_briefing_proxy",
    requestId: context.requestId,
    stage,
    elapsedMs: elapsedMs(context.startedAt),
    ...details,
  }));
}

function degradedResponse(context: RequestContext, error: ProxyError): Response {
  console.warn(JSON.stringify({
    event: "weekly_farm_briefing_proxy",
    requestId: context.requestId,
    stage: context.stage,
    code: error.code,
    elapsedMs: elapsedMs(context.startedAt),
  }));

  return jsonResponse(200, {
    source: "gemini",
    status: "degraded",
    errorCode: error.code,
    errorStage: context.stage,
    model: context.model,
    fetchedAt: new Date().toISOString(),
    sourceUrl: context.sourceUrl.toString(),
    sourceTitle: context.body.sourceTitle ?? null,
    publishedAt: context.body.publishedAt ?? null,
    data: null,
  });
}

function validateModelName(model: string): string {
  const safe = model.trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(safe)) {
    throw new ProxyError(400, "Invalid Gemini model name.", "invalid_model_name");
  }
  return safe;
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

  if (!ALLOWED_PDF_HOSTS.has(url.hostname.toLowerCase())) {
    throw new ProxyError(400, "sourceUrl host is not allowed.", "invalid_source_url_host");
  }

  return url;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function briefingJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      relevant: { type: "boolean" },
      headline: { type: "string" },
      summaryBullets: { type: "array", items: { type: "string" }, maxItems: 5 },
      actionBullets: { type: "array", items: { type: "string" }, maxItems: 5 },
      cautionBullets: { type: "array", items: { type: "string" }, maxItems: 5 },
      weatherBullets: { type: "array", items: { type: "string" }, maxItems: 5 },
      pestRiskBullets: { type: "array", items: { type: "string" }, maxItems: 5 },
      irrigationBullets: { type: "array", items: { type: "string" }, maxItems: 5 },
      growthManagementBullets: { type: "array", items: { type: "string" }, maxItems: 5 },
      evidenceSnippets: { type: "array", items: { type: "string" }, maxItems: 5 },
    },
    required: [
      "relevant",
      "headline",
      "summaryBullets",
      "actionBullets",
      "cautionBullets",
      "weatherBullets",
      "pestRiskBullets",
      "irrigationBullets",
      "growthManagementBullets",
      "evidenceSnippets",
    ],
  };
}

function buildPrompt(input: WeeklyFarmBriefingProxyRequest): string {
  const cropGroup = input.cropGroup?.trim() || "unknown";
  const fieldContext = input.field
    ? JSON.stringify({
      id: input.field.id ?? null,
      name: input.field.name ?? null,
      address: input.field.address ?? null,
      lat: input.field.lat ?? null,
      lng: input.field.lng ?? null,
      growthStage: input.field.growthStage ?? null,
      areaM2: input.field.areaM2 ?? null,
    })
    : "null";
  const weatherContext = input.weather
    ? JSON.stringify({
      sourceStatus: input.weather.sourceStatus ?? null,
      collectedAt: input.weather.collectedAt ?? null,
      precipitation: input.weather.precipitation ?? null,
      temperature: input.weather.temperature ?? null,
      wind: input.weather.wind ?? null,
      humidity: input.weather.humidity ?? null,
      riskScore: input.weather.riskScore ?? null,
      riskSummary: input.weather.riskSummary ?? null,
    })
    : "null";

  return [
    "You are preparing a weekly farm information briefing for Korean farmers.",
    "Read the attached PDF and create a crop-specific base briefing.",
    "The registered field and KMA weather context are optional. If either context is null, do not invent field or weather details.",
    "The weather context, when present, is a merged KMA ultra-short actual observation and village forecast snapshot supplied by the app.",
    "Use precipitation, temperature, wind, and humidity explicitly only when they are present.",
    "Summarize only PDF content directly relevant to the selected crop or crop group, then tailor recommendations only to the context that was actually supplied.",
    "First locate PDF passages whose heading or body contains selected_crop exactly.",
    "If selected_crop is not found, locate passages whose heading or body contains crop_group exactly.",
    "When matching Korean crop names, ignore whitespace between syllables. For example, '과 수' is the same as '과수'.",
    "If crop_group is '과수', use only the fruit-tree chapter or fruit-tree passages and do not use field crop, vegetable, flower, special crop, livestock, or beekeeping chapters.",
    "If neither selected_crop nor crop_group is found, set relevant=false and leave all bullet arrays empty.",
    "Ignore every section about other crops, even if it appears earlier in the PDF.",
    "Do not use content from a section whose heading names a different crop or crop group.",
    "If relevant=true, the headline and every bullet must explicitly include selected_crop, crop_group, or the registered field name.",
    "Do not summarize rice, vegetables, livestock, or other crop sections unless selected_crop or crop_group matches them.",
    "Write every JSON string value in Korean.",
    "Do not invent pesticide names, disease names, pest names, control instructions, or field work that is not present in the PDF.",
    "Do not diagnose disease or pest occurrence as confirmed. Use possibility/check wording only.",
    "Do not give pesticide dosage, dilution, harvest interval, or product instructions.",
    "If the PDF has no relevant content, set relevant=false and use a short Korean headline meaning no relevant content.",
    "summaryBullets should describe the current week's situation.",
    "weatherBullets should be empty when kma_weather_context is null; otherwise state how precipitation, temperature, wind, and humidity change this week's priority.",
    "pestRiskBullets should describe disease or pest possibility/check points only when supported by weather and PDF context.",
    "irrigationBullets should judge irrigation only when weather context is present; otherwise leave it empty unless the PDF directly supports the point.",
    "growthManagementBullets should describe crop growth management points for this crop and week.",
    "actionBullets should list farmer-checkable actions only and should not depend on missing field or weather context.",
    "cautionBullets should list cautions only.",
    "evidenceSnippets should quote or closely paraphrase short source phrases from the PDF that support the briefing.",
    "Return only one JSON object. Do not return markdown, code fences, or commentary.",
    `selected_crop: ${input.cropName.trim() || "unknown"}`,
    `crop_group: ${cropGroup}`,
    `registered_field: ${fieldContext}`,
    `kma_weather_context: ${weatherContext}`,
    `source_title: ${input.sourceTitle?.trim() || "weekly farm info"}`,
    `published_at: ${input.publishedAt?.trim() || "unknown"}`,
  ].join("\n");
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  let context: RequestContext | null = null;

  try {
    ensureMethod(request, ["POST"]);
    const body = await readJson<WeeklyFarmBriefingProxyRequest>(request);
    if (typeof body.sourceUrl !== "string") {
      throw new ProxyError(400, "sourceUrl is required.", "missing_source_url");
    }
    if (typeof body.cropName !== "string" || !body.cropName.trim()) {
      throw new ProxyError(400, "cropName is required.", "missing_crop_name");
    }

    const sourceUrl = validateSourceUrl(body.sourceUrl);
    const requestedModel = typeof body.model === "string" ? body.model.trim() : null;
    const model = validateModelName(DEFAULT_GEMINI_MODEL);
    context = {
      requestId: crypto.randomUUID(),
      startedAt: Date.now(),
      stage: "validated",
      body,
      sourceUrl,
      model,
    };
    logStage(context, "pdf_fetch_start", { sourceHost: sourceUrl.hostname, requestedModel });

    const pdfResponse = await fetchWithTimeout(
      sourceUrl.toString(),
      {
        method: "GET",
        headers: { Accept: "application/pdf,*/*" },
      },
      PDF_FETCH_TIMEOUT_MS,
    );
    logStage(context, "pdf_fetch_complete", { status: pdfResponse.status });
    if (!pdfResponse.ok) {
      throw new ProxyError(pdfResponse.status, "Weekly PDF request failed.", "weekly_pdf_upstream_error");
    }

    logStage(context, "pdf_read_start");
    const bytes = new Uint8Array(await pdfResponse.arrayBuffer());
    logStage(context, "pdf_read_complete", { bytes: bytes.length });
    if (bytes.length === 0) {
      throw new ProxyError(422, "Weekly PDF is empty.", "empty_weekly_pdf");
    }
    if (bytes.length > MAX_PDF_BYTES) {
      throw new ProxyError(413, "Weekly PDF is too large for inline Gemini processing.", "weekly_pdf_too_large", {
        maxBytes: MAX_PDF_BYTES,
        actualBytes: bytes.length,
      });
    }
    if (!looksLikePdf(bytes)) {
      throw new ProxyError(415, "Only PDF weekly farm info documents are supported.", "unsupported_weekly_document");
    }

    const apiKey = requireEnv("GEMINI_API_KEY");
    const base = GEMINI_BASE_URL.endsWith("/") ? GEMINI_BASE_URL : `${GEMINI_BASE_URL}/`;
    const url = new URL(`v1beta/models/${context.model}:generateContent`, base);
    url.searchParams.set("key", apiKey);

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(body) },
            {
              inline_data: {
                mime_type: "application/pdf",
                data: bytesToBase64(bytes),
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: briefingJsonSchema(),
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
      },
    };

    logStage(context, "gemini_fetch_start", {
      model: context.model,
      pdfBytes: bytes.length,
      timeoutMs: GEMINI_REQUEST_TIMEOUT_MS,
    });
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
      GEMINI_REQUEST_TIMEOUT_MS,
    );
    logStage(context, "gemini_fetch_complete", { status: upstream.status });

    const upstreamBody = await readUpstreamBody(upstream);
    if (!upstream.ok) {
      throw new ProxyError(
        upstream.status,
        "Gemini weekly briefing request failed.",
        "gemini_upstream_error",
        upstreamBody,
      );
    }

    return jsonResponse(200, {
      source: "gemini",
      status: "ready",
      model: context.model,
      fetchedAt: new Date().toISOString(),
      sourceUrl: sourceUrl.toString(),
      sourceTitle: body.sourceTitle ?? null,
      publishedAt: body.publishedAt ?? null,
      data: upstreamBody,
    });
  } catch (error) {
    if (error instanceof ProxyError && shouldReturnDegradedWeeklyBriefing(error.code) && context) {
      return degradedResponse(context, error);
    }
    return handleProxyError(error);
  }
});
