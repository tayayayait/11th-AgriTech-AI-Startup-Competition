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

const FARMMAP_BASE_URL = Deno.env.get("FARMMAP_BASE_URL") ?? "https://agis.epis.or.kr/ASD";
const FARMMAP_WFS_URL = Deno.env.get("FARMMAP_WFS_URL") ?? "https://agis.epis.or.kr/geoserver/farmmap/ows";

const FARMMAP_OPERATIONS = {
  sdkScript: "farmmapApi/farmapApi.do",
  searchPnu: "farmmapApi/getFarmmapDataSeachPnu.do",
  searchXY: "farmmapApi/getFarmmapDataSeachXY.do",
  searchRadius: "farmmapApi/getFarmmapDataSeachRadius.do",
  searchBjdAndLandCode: "farmmapApi/getFarmmapDataSeachBjdAndLandCode.do",
  searchBjdAndUpdateCode: "farmmapApi/getFarmmapDataSeachBjdAndUpdateCode.do",
  searchBjdAndUpdateDate: "farmmapApi/getFarmmapDataSeachBjdAndUpdateDate.do",
  searchRelationLayer: "farmmapApi/getFarmmapDataSeachRelationLayer.do",
  searchAnalysisBasePnu: "farmmapApi/getFarmmapDataSeachAnalysisBasePnu.do",
  searchAnalysisBaseAttr: "farmmapApi/getFarmmapDataSeachAnalysisBaseAttr.do",
  searchRegionExtent: "geoserver/farmmap/ows",
} as const;

type FarmmapOperation = keyof typeof FARMMAP_OPERATIONS;
type RequestParams = Record<string, string | number | boolean | null | undefined>;

interface FarmmapProxyRequest {
  operation: FarmmapOperation;
  params?: RequestParams;
}

function isFarmmapOperation(value: string): value is FarmmapOperation {
  return value in FARMMAP_OPERATIONS;
}

function farmmapUrl(pathname: string, params: Record<string, string | number | boolean | null | undefined>): URL {
  const query = buildQueryString({
    apiKey: requireEnv("FARMMAP_API_KEY"),
    domain: requireEnv("FARMMAP_DOMAIN"),
    ...params,
  });
  const url = new URL(pathname, FARMMAP_BASE_URL.endsWith("/") ? FARMMAP_BASE_URL : `${FARMMAP_BASE_URL}/`);
  url.search = query.toString();
  return url;
}

const FARMMAP_LAND_NAMES: Record<string, string> = {
  "01": "논",
  "02": "밭",
  "03": "과수",
  "04": "시설",
  "06": "비경지",
};

function quoteCqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function farmmapRegionPrefix(regionCode: string): string {
  const sigunguCode = regionCode.slice(2, 5);
  const eupMyeonDongCode = regionCode.slice(5, 8);
  const riCode = regionCode.slice(8, 10);
  if (sigunguCode === "000") return regionCode.slice(0, 2);
  if (eupMyeonDongCode === "000") return regionCode.slice(0, 5);
  if (riCode === "00") return regionCode.slice(0, 8);
  return regionCode;
}

function farmmapRegionCql(regionCode: string): string {
  const prefix = farmmapRegionPrefix(regionCode);
  if (prefix.length === 10) return `stdg_cd=${quoteCqlString(prefix)}`;
  const minCode = prefix.padEnd(10, "0");
  const maxCode = prefix.padEnd(10, "9");
  return `stdg_cd >= ${quoteCqlString(minCode)} AND stdg_cd <= ${quoteCqlString(maxCode)}`;
}

function splitLandCodes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(",");
  if (typeof value === "number") return [String(value).padStart(2, "0")];
  return [];
}

function farmmapRegionExtentUrl(params: RequestParams): URL {
  const regionCode = String(params.regionCode ?? params.bjdCd ?? "");
  if (!/^\d{10}$/.test(regionCode)) {
    throw new ProxyError(400, "regionCode must be a 10-digit legal district code.", "invalid_region_code");
  }

  const landNames = Array.from(new Set(splitLandCodes(params.landCodes ?? params.landCd)
    .map((code) => FARMMAP_LAND_NAMES[code])
    .filter((name): name is string => Boolean(name))));
  if (landNames.length === 0) {
    throw new ProxyError(400, "At least one valid Farmmap land code is required.", "invalid_land_code");
  }

  const maxFeatures = Math.min(Math.max(Number(params.maxFeatures ?? 500), 1), 1000);
  const cqlFilter = [
    farmmapRegionCql(regionCode),
    `clsf_nm IN (${landNames.map(quoteCqlString).join(",")})`,
  ].join(" AND ");

  const url = new URL(FARMMAP_WFS_URL);
  url.search = buildQueryString({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName: "farmmap:farm_map_api",
    outputFormat: "application/json",
    maxFeatures,
    CQL_FILTER: cqlFilter,
  }).toString();
  return url;
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    ensureMethod(request, ["POST"]);
    const body = await readJson<FarmmapProxyRequest>(request);

    if (!body.operation || !isFarmmapOperation(body.operation)) {
      throw new ProxyError(400, "Invalid farmmap operation.", "invalid_operation");
    }

    const pathname = FARMMAP_OPERATIONS[body.operation];
    const url = body.operation === "searchRegionExtent"
      ? farmmapRegionExtentUrl(body.params ?? {})
      : farmmapUrl(pathname, body.params ?? {});

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
      throw new ProxyError(upstream.status, "Farmmap API request failed.", "farmmap_upstream_error", upstreamBody);
    }

    return jsonResponse(200, {
      source: "farmmap",
      operation: body.operation,
      fetchedAt: new Date().toISOString(),
      data: upstreamBody,
    });
  } catch (error) {
    return handleProxyError(error);
  }
});
