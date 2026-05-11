import { invokeApiAdapter } from "@/services/api/edgeAdapter";
import type { ApiAdapterResponse, ApiRequestParams } from "@/services/api/types";

export type NpmsServiceCode =
  | "SVC05"
  | "SVC07"
  | "SVC13"
  | "SVC16"
  | "SVC41"
  | "SVC42"
  | "SVC51"
  | "SVC52"
  | "SVC53";

interface NpmsProxyRequest {
  serviceCode: NpmsServiceCode;
  params?: ApiRequestParams;
}

interface NpmsProxyResponse extends ApiAdapterResponse<unknown, "npms"> {
  source: "npms";
  serviceCode: NpmsServiceCode;
  fetchedAt: string;
}

export interface NpmsApiResponse<TItem extends Record<string, unknown> = Record<string, unknown>>
  extends ApiAdapterResponse<unknown, "npms"> {
  serviceCode: NpmsServiceCode;
  service: Record<string, unknown>;
  items: TItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractService(data: unknown): Record<string, unknown> {
  if (!isRecord(data)) return {};
  const service = data.service;
  return isRecord(service) ? service : data;
}

function extractItems<TItem extends Record<string, unknown>>(service: Record<string, unknown>): TItem[] {
  const list = service.list ?? service.items ?? service.item ?? service.structList;
  if (Array.isArray(list)) return list.filter(isRecord) as TItem[];
  if (isRecord(list)) return [list as TItem];
  return [];
}

function throwIfNpmsError(service: Record<string, unknown>): void {
  const errorCode = typeof service.errorCode === "string" ? service.errorCode : "";
  if (!errorCode) return;
  const message = typeof service.errorMsg === "string" ? service.errorMsg : "NCPMS API request failed.";
  throw new Error(`${message} (${errorCode})`);
}

export async function fetchNpms<TItem extends Record<string, unknown> = Record<string, unknown>>(
  serviceCode: NpmsServiceCode,
  params?: ApiRequestParams,
): Promise<NpmsApiResponse<TItem>> {
  const response = await invokeApiAdapter<NpmsProxyResponse, NpmsProxyRequest>("npms", "npms-proxy", {
    serviceCode,
    params,
  });
  const service = extractService(response.data);
  throwIfNpmsError(service);

  return {
    source: response.source,
    fetchedAt: response.fetchedAt,
    serviceCode: response.serviceCode,
    data: response.data,
    service,
    items: extractItems<TItem>(service),
  };
}
