import { invokeApiAdapter } from "@/services/api/edgeAdapter";
import type { ApiAdapterResponse, ApiRequestParams } from "@/services/api/types";

export type FarmmapOperation =
  | "sdkScript"
  | "searchPnu"
  | "searchXY"
  | "searchRadius"
  | "searchBjdAndLandCode"
  | "searchBjdAndUpdateCode"
  | "searchBjdAndUpdateDate"
  | "searchRelationLayer"
  | "searchAnalysisBasePnu"
  | "searchAnalysisBaseAttr"
  | "searchRegionExtent";

interface FarmmapProxyRequest {
  operation: FarmmapOperation;
  params?: ApiRequestParams;
}

export interface FarmmapProxyResponse extends ApiAdapterResponse<unknown, "farmmap"> {
  source: "farmmap";
  operation: FarmmapOperation;
  fetchedAt: string;
}

export async function requestFarmmap(
  operation: FarmmapOperation,
  params?: ApiRequestParams,
): Promise<FarmmapProxyResponse> {
  const payload: FarmmapProxyRequest = { operation, params };
  return invokeApiAdapter<FarmmapProxyResponse, FarmmapProxyRequest>("farmmap", "farmmap-proxy", payload);
}

export function fetchFarmmapSdkScript(): Promise<FarmmapProxyResponse> {
  return requestFarmmap("sdkScript");
}

export function fetchFarmmapByPnu(params: ApiRequestParams): Promise<FarmmapProxyResponse> {
  return requestFarmmap("searchPnu", params);
}

export function fetchFarmmapByXY(params: ApiRequestParams): Promise<FarmmapProxyResponse> {
  return requestFarmmap("searchXY", params);
}

export function fetchFarmmapByRadius(params: ApiRequestParams): Promise<FarmmapProxyResponse> {
  return requestFarmmap("searchRadius", params);
}

export function fetchFarmmapByBjdAndLandCode(params: ApiRequestParams): Promise<FarmmapProxyResponse> {
  return requestFarmmap("searchBjdAndLandCode", params);
}

export function fetchFarmmapByBjdAndUpdateCode(params: ApiRequestParams): Promise<FarmmapProxyResponse> {
  return requestFarmmap("searchBjdAndUpdateCode", params);
}

export function fetchFarmmapByBjdAndUpdateDate(params: ApiRequestParams): Promise<FarmmapProxyResponse> {
  return requestFarmmap("searchBjdAndUpdateDate", params);
}

export function fetchFarmmapRelationLayer(params: ApiRequestParams): Promise<FarmmapProxyResponse> {
  return requestFarmmap("searchRelationLayer", params);
}

export function fetchFarmmapAnalysisBaseByPnu(params: ApiRequestParams): Promise<FarmmapProxyResponse> {
  return requestFarmmap("searchAnalysisBasePnu", params);
}

export function fetchFarmmapAnalysisBaseByAttr(params: ApiRequestParams): Promise<FarmmapProxyResponse> {
  return requestFarmmap("searchAnalysisBaseAttr", params);
}

export function fetchFarmmapRegionExtent(params: ApiRequestParams): Promise<FarmmapProxyResponse> {
  return requestFarmmap("searchRegionExtent", params);
}
