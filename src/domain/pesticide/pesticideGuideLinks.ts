export interface PesticideGuideReportLinkInput {
  cropName?: string | null;
  targetKeyword?: string | null;
  itemKeyword?: string | null;
}

const appendIfPresent = (params: URLSearchParams, key: string, value?: string | null): void => {
  const trimmed = value?.trim();
  if (trimmed) params.set(key, trimmed);
};

export const buildPesticideGuideReportUrl = (input: PesticideGuideReportLinkInput): string => {
  const params = new URLSearchParams();
  params.set("tab", "pesticide");
  appendIfPresent(params, "crop", input.cropName);
  appendIfPresent(params, "target", input.targetKeyword);
  appendIfPresent(params, "item", input.itemKeyword);
  return `/reports?${params.toString()}`;
};
