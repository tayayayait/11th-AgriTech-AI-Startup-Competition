import { parseKmaItems, type KmaItemLike } from "@/domain/weather/kma";
import { toInvalidPayloadError } from "@/services/api/errors";
import { invokeApiAdapter } from "@/services/api/edgeAdapter";
import type { ApiAdapterResponse, ApiRequestParams } from "@/services/api/types";

export type KmaEndpoint = "ultraSrtNcst" | "ultraSrtFcst" | "vilageFcst";

interface KmaProxyRequest {
  endpoint: KmaEndpoint;
  params: ApiRequestParams;
}

interface KmaProxyResponse extends ApiAdapterResponse<unknown, "kma"> {
  source: "kma";
  endpoint: KmaEndpoint;
  fetchedAt: string;
}

export interface KmaApiResponse extends ApiAdapterResponse<KmaItemLike[], "kma"> {
  endpoint: KmaEndpoint;
  items: KmaItemLike[];
  rawData: unknown;
}

export async function fetchKma(
  endpoint: KmaEndpoint,
  params: ApiRequestParams,
): Promise<KmaApiResponse> {
  const payload: KmaProxyRequest = { endpoint, params };
  const response = await invokeApiAdapter<KmaProxyResponse, KmaProxyRequest>("kma", "kma-proxy", payload);
  let items: KmaItemLike[];
  try {
    items = parseKmaItems(response.data);
  } catch (error) {
    throw toInvalidPayloadError(error, "kma");
  }

  return {
    source: response.source,
    endpoint: response.endpoint,
    fetchedAt: response.fetchedAt,
    data: items,
    items,
    rawData: response.data,
  };
}
