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

const STANDARD_REGION_BASE_URL =
  Deno.env.get("STANDARD_REGION_BASE_URL") ?? "http://apis.data.go.kr/1741000/StanReginCd";

const STANDARD_REGION_OPERATIONS = {
  list: "getStanReginCdList",
} as const;

type StandardRegionOperation = keyof typeof STANDARD_REGION_OPERATIONS;
type RequestParams = Record<string, string | number | boolean | null | undefined>;

interface StandardRegionProxyRequest {
  operation: StandardRegionOperation;
  params?: RequestParams;
}

function isStandardRegionOperation(value: string): value is StandardRegionOperation {
  return value in STANDARD_REGION_OPERATIONS;
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    ensureMethod(request, ["POST"]);
    const body = await readJson<StandardRegionProxyRequest>(request);

    if (!body.operation || !isStandardRegionOperation(body.operation)) {
      throw new ProxyError(400, "Invalid standard region operation.", "invalid_operation");
    }

    const query = buildQueryString({
      ServiceKey: requireEnv("STANDARD_REGION_API_KEY"),
      type: "json",
      pageNo: 1,
      numOfRows: 1000,
      flag: "Y",
      ...body.params,
    });

    const pathname = STANDARD_REGION_OPERATIONS[body.operation];
    const url = new URL(
      pathname,
      STANDARD_REGION_BASE_URL.endsWith("/") ? STANDARD_REGION_BASE_URL : `${STANDARD_REGION_BASE_URL}/`,
    );
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
    if (!upstream.ok) {
      throw new ProxyError(
        upstream.status,
        "Standard region API request failed.",
        "standard_region_upstream_error",
        upstreamBody,
      );
    }

    return jsonResponse(200, {
      source: "standardRegion",
      operation: body.operation,
      fetchedAt: new Date().toISOString(),
      data: upstreamBody,
    });
  } catch (error) {
    return handleProxyError(error);
  }
});
