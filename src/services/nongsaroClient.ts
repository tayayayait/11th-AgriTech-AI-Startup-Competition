import { parseNongsaroResponse, type NongsaroParsedResponse } from "@/domain/nongsaro/xml";
import { toInvalidPayloadError } from "@/services/api/errors";
import { invokeApiAdapter } from "@/services/api/edgeAdapter";
import type { ApiAdapterResponse, ApiRequestParams } from "@/services/api/types";

interface NongsaroProxyRequest {
  serviceName: string;
  operationName: string;
  params?: ApiRequestParams;
}

interface NongsaroProxyResponse extends ApiAdapterResponse<unknown, "nongsaro"> {
  source: "nongsaro";
  serviceName: string;
  operationName: string;
  fetchedAt: string;
}

export interface NongsaroApiResponse extends ApiAdapterResponse<NongsaroParsedResponse, "nongsaro"> {
  serviceName: string;
  operationName: string;
  items: Array<Record<string, string>>;
  resultCode: string;
  resultMsg: string;
}

export async function fetchNongsaro(
  serviceName: string,
  operationName: string,
  params?: ApiRequestParams,
): Promise<NongsaroApiResponse> {
  const payload: NongsaroProxyRequest = { serviceName, operationName, params };
  const response = await invokeApiAdapter<NongsaroProxyResponse, NongsaroProxyRequest>(
    "nongsaro",
    "nongsaro-proxy",
    payload,
  );
  let parsed: NongsaroParsedResponse;
  try {
    parsed = parseNongsaroResponse(response.data);
  } catch (error) {
    throw toInvalidPayloadError(error, "nongsaro");
  }

  return {
    source: response.source,
    serviceName: response.serviceName,
    operationName: response.operationName,
    fetchedAt: response.fetchedAt,
    data: parsed,
    items: parsed.items,
    resultCode: parsed.resultCode,
    resultMsg: parsed.resultMsg,
  };
}

export function fetchNongsaroFrcDsstrPrevntYear(params?: ApiRequestParams): Promise<NongsaroApiResponse> {
  return fetchNongsaro("frcDsstrPrevnt", "frcDsstrPrevntYear", params);
}

export function fetchNongsaroFrcDsstrPrevntList(params?: ApiRequestParams): Promise<NongsaroApiResponse> {
  return fetchNongsaro("frcDsstrPrevnt", "frcDsstrPrevntLst", params);
}

export function fetchNongsaroAgchmSafeManualList(params?: ApiRequestParams): Promise<NongsaroApiResponse> {
  return fetchNongsaro("agchmSafeManual", "agchmSafeManualList", params);
}
