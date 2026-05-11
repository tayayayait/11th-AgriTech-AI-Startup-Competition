import { parseStandardRegionCodeResult } from "@/domain/standardRegion/standardRegion";
import type { StandardRegionCodeResult } from "@/domain/standardRegion/types";
import { toInvalidPayloadError } from "@/services/api/errors";
import { invokeApiAdapter } from "@/services/api/edgeAdapter";
import type { ApiAdapterResponse, ApiRequestParams } from "@/services/api/types";

type StandardRegionOperation = "list";

interface StandardRegionProxyRequest {
  operation: StandardRegionOperation;
  params?: ApiRequestParams;
}

interface StandardRegionProxyResponse extends ApiAdapterResponse<unknown, "standardRegion"> {
  source: "standardRegion";
  operation: StandardRegionOperation;
  fetchedAt: string;
}

export interface StandardRegionApiResponse extends ApiAdapterResponse<StandardRegionCodeResult, "standardRegion"> {
  operation: StandardRegionOperation;
  fetchedAt: string;
}

export async function fetchStandardRegionCodes(params?: ApiRequestParams): Promise<StandardRegionApiResponse> {
  const payload: StandardRegionProxyRequest = { operation: "list", params };
  const response = await invokeApiAdapter<StandardRegionProxyResponse, StandardRegionProxyRequest>(
    "standardRegion",
    "standard-region-proxy",
    payload,
  );

  try {
    return {
      source: response.source,
      operation: response.operation,
      fetchedAt: response.fetchedAt,
      data: parseStandardRegionCodeResult(response.data),
    };
  } catch (error) {
    throw toInvalidPayloadError(error, "standardRegion");
  }
}
