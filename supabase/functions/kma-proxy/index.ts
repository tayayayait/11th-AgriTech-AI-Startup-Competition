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

const KMA_BASE_URL = Deno.env.get("KMA_BASE_URL") ?? "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";

const KMA_ENDPOINTS = {
  ultraSrtNcst: "getUltraSrtNcst",
  ultraSrtFcst: "getUltraSrtFcst",
  vilageFcst: "getVilageFcst",
} as const;

type KmaEndpoint = keyof typeof KMA_ENDPOINTS;
type RequestParams = Record<string, string | number | boolean | null | undefined>;

interface KmaProxyRequest {
  endpoint: KmaEndpoint;
  params: RequestParams;
}

function isKmaEndpoint(value: string): value is KmaEndpoint {
  return value in KMA_ENDPOINTS;
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    ensureMethod(request, ["POST"]);
    const body = await readJson<KmaProxyRequest>(request);

    if (!body.endpoint || !isKmaEndpoint(body.endpoint)) {
      throw new ProxyError(400, "Invalid KMA endpoint.", "invalid_endpoint");
    }

    if (!body.params || typeof body.params !== "object") {
      throw new ProxyError(400, "KMA params are required.", "missing_params");
    }

    const query = buildQueryString({
      serviceKey: requireEnv("KMA_SERVICE_KEY"),
      pageNo: 1,
      numOfRows: 1000,
      dataType: "JSON",
      ...body.params,
    });

    const pathname = KMA_ENDPOINTS[body.endpoint];
    const url = new URL(pathname, KMA_BASE_URL.endsWith("/") ? KMA_BASE_URL : `${KMA_BASE_URL}/`);
    url.search = query.toString();

    const upstream = await fetchWithTimeout(
      url.toString(),
      {
        method: "GET",
        headers: { Accept: "application/json, text/xml, */*" },
      },
      12000,
    );

    const upstreamBody = await readUpstreamBody(upstream);
    if (!upstream.ok) {
      throw new ProxyError(upstream.status, "KMA API request failed.", "kma_upstream_error", upstreamBody);
    }

    return jsonResponse(200, {
      source: "kma",
      endpoint: body.endpoint,
      fetchedAt: new Date().toISOString(),
      data: upstreamBody,
    });
  } catch (error) {
    return handleProxyError(error);
  }
});
