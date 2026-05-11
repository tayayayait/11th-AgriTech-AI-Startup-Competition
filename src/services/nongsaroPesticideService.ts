import { normalizeNongsaroUrl } from "@/domain/nongsaro/common";
import { fetchNongsaroAgchmSafeManualList } from "@/services/nongsaroClient";

export interface NongsaroPesticideGuide {
  sourceId: string;
  title: string;
  cropName: string | null;
  reformYm: string | null;
  nationName: string | null;
  fileName: string | null;
  fileUrl: string | null;
}

export interface PesticideGuideQueryInput {
  cropName: string;
  titleKeyword?: string;
  reformYear?: string;
  nationCodes?: string[];
}

function normalizeGuide(item: Record<string, string>): NongsaroPesticideGuide | null {
  const sourceId = (item.cntntsNo ?? "").trim();
  const title = (item.cntntsSj ?? "").trim();
  if (!sourceId || !title) return null;

  return {
    sourceId,
    title,
    cropName: (item.prdlstCodeNm ?? "").trim() || null,
    reformYm: (item.reformYm ?? "").trim() || null,
    nationName: (item.nationCodeNm ?? "").trim() || null,
    fileName: (item.fileNm ?? "").trim() || null,
    fileUrl: normalizeNongsaroUrl(item.fileUrl ?? null),
  };
}

export async function getPesticideSafetyGuides(input: PesticideGuideQueryInput | string): Promise<NongsaroPesticideGuide[]> {
  const query: PesticideGuideQueryInput =
    typeof input === "string"
      ? { cropName: input }
      : input;

  const cropKeyword = query.cropName.trim();
  if (!cropKeyword) return [];

  const requestParams = {
    sPrdlstCodeNm: cropKeyword,
    sCntntsSj: query.titleKeyword?.trim() || undefined,
    sReformYear: query.reformYear?.trim() || undefined,
    sNationVal: query.nationCodes && query.nationCodes.length > 0 ? query.nationCodes.join(",") : undefined,
    pageNo: 1,
  };

  const response = await fetchNongsaroAgchmSafeManualList(requestParams);
  const guides = response.items
    .map(normalizeGuide)
    .filter((item): item is NongsaroPesticideGuide => item !== null)
    .slice(0, 8);
  if (guides.length > 0 || !requestParams.sCntntsSj) return guides;

  const fallbackResponse = await fetchNongsaroAgchmSafeManualList({
    ...requestParams,
    sCntntsSj: undefined,
  });

  return fallbackResponse.items
    .map(normalizeGuide)
    .filter((item): item is NongsaroPesticideGuide => item !== null)
    .slice(0, 8);
}
