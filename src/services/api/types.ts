export type ExternalApiSource = "nongsaro" | "kma" | "farmmap" | "gemini" | "standardRegion" | "npms" | "psis";

export type ApiRequestParams = Record<string, string | number | boolean | null | undefined>;

export interface ApiInvokeOptions {
  signal?: AbortSignal;
  timeout?: number;
}

export interface ApiAdapterResponse<TData, TSource extends ExternalApiSource = ExternalApiSource> {
  source: TSource;
  fetchedAt: string;
  data: TData;
}
