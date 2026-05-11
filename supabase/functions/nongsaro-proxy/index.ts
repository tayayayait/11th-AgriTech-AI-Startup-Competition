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

const NONGSARO_BASE_URL = Deno.env.get("NONGSARO_BASE_URL") ?? "http://api.nongsaro.go.kr/service";

const ALLOWED_OPERATIONS: Record<string, ReadonlySet<string>> = {
  weekFarmInfo: new Set(["weekFarmInfoList"]),
  dbyhsCccrrncInfo: new Set(["dbyhsCccrrncInfoYear", "dbyhsCccrrncInfoList"]),
  farmWorkingPlanNew: new Set([
    "workScheduleGrpList",
    "workScheduleLst",
    "workScheduleEraInfoLst",
    "workScheduleEraInfoJsonLst",
    "workScheduleDtl",
  ]),
  agchmSafeManual: new Set(["nationList", "agchmSafeManualList"]),
  frcDsstrPrevnt: new Set(["frcDsstrPrevntYear", "frcDsstrPrevntLst"]),
  cropEbook: new Set(["mainCategoryList", "middleCategoryList", "subCategoryList", "videoList"]),
};

type RequestParams = Record<string, string | number | boolean | null | undefined>;

interface NongsaroProxyRequest {
  serviceName: string;
  operationName: string;
  params?: RequestParams;
}

function validatePathPart(value: string, fieldName: string): string {
  const safe = value.trim();
  if (!safe) {
    throw new ProxyError(400, `${fieldName} is required.`, "missing_path_part");
  }
  if (!/^[a-zA-Z0-9_]+$/.test(safe)) {
    throw new ProxyError(400, `${fieldName} contains unsupported characters.`, "invalid_path_part");
  }
  return safe;
}

function assertAllowedOperation(serviceName: string, operationName: string): void {
  const operations = ALLOWED_OPERATIONS[serviceName];
  if (!operations?.has(operationName)) {
    throw new ProxyError(
      400,
      "Unsupported Nongsaro service or operation.",
      "unsupported_nongsaro_operation",
      { serviceName, operationName },
    );
  }
}

function getApiKeyForService(serviceName: string): string {
  if (serviceName === "cropEbook") {
    return Deno.env.get("NONGSARO_CROP_EBOOK_API_KEY")?.trim() || requireEnv("NONGSARO_API_KEY");
  }
  return requireEnv("NONGSARO_API_KEY");
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    ensureMethod(request, ["POST"]);
    const body = await readJson<NongsaroProxyRequest>(request);

    if (typeof body.serviceName !== "string") {
      throw new ProxyError(400, "serviceName is required.", "missing_path_part");
    }
    if (typeof body.operationName !== "string") {
      throw new ProxyError(400, "operationName is required.", "missing_path_part");
    }

    const serviceName = validatePathPart(body.serviceName, "serviceName");
    const operationName = validatePathPart(body.operationName, "operationName");
    assertAllowedOperation(serviceName, operationName);

    const query = buildQueryString({
      apiKey: getApiKeyForService(serviceName),
      ...(body.params ?? {}),
    });

    const base = NONGSARO_BASE_URL.endsWith("/") ? NONGSARO_BASE_URL : `${NONGSARO_BASE_URL}/`;
    const url = new URL(`${serviceName}/${operationName}`, base);
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
      throw new ProxyError(upstream.status, "Nongsaro API request failed.", "nongsaro_upstream_error", upstreamBody);
    }

    return jsonResponse(200, {
      source: "nongsaro",
      serviceName,
      operationName,
      fetchedAt: new Date().toISOString(),
      data: upstreamBody,
    });
  } catch (error) {
    return handleProxyError(error);
  }
});
