import { normalizeNongsaroUrl, pickLatestYearFromItems } from "@/domain/nongsaro/common";
import {
  fetchNongsaroFrcDsstrPrevntList,
  fetchNongsaroFrcDsstrPrevntYear,
} from "@/services/nongsaroClient";

export interface NongsaroDisasterSource {
  sourceId: string;
  title: string;
  publishedAt: string | null;
  attachmentName: string | null;
  attachmentPath: string | null;
  thumbnailName: string | null;
}

function normalizeSource(item: Record<string, string>): NongsaroDisasterSource | null {
  const sourceId = (item.cntntsNo ?? "").trim();
  const title = (item.cntntsSj ?? "").trim();
  if (!sourceId || !title) return null;

  return {
    sourceId,
    title,
    publishedAt: (item.svcDtx ?? item.svcDt ?? "").trim() || null,
    attachmentName: (item.rtnOrginlFileNm ?? "").trim() || null,
    attachmentPath: normalizeNongsaroUrl(item.rtnFileCours ?? null),
    thumbnailName: (item.rtnThumbFileNm ?? "").trim() || null,
  };
}

export async function getDisasterPreventionSources(keyword: string): Promise<NongsaroDisasterSource[]> {
  const searchText = keyword.trim();
  if (!searchText) return [];

  const yearResponse = await fetchNongsaroFrcDsstrPrevntYear({
    sType: "sCntntsSj",
    sText: searchText,
  });
  const latestYear = pickLatestYearFromItems(yearResponse.items);

  const listResponse = await fetchNongsaroFrcDsstrPrevntList({
    sYear: latestYear,
    sType: "sCntntsSj",
    sText: searchText,
    pageNo: 1,
    numOfRows: 10,
  });
  return listResponse.items
    .map(normalizeSource)
    .filter((item): item is NongsaroDisasterSource => item !== null)
    .slice(0, 5);
}
