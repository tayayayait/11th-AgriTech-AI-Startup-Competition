import { normalizeNongsaroUrl, pickLatestYearFromItems } from "@/domain/nongsaro/common";
import {
  getNongsaroCropSearchProfile,
  nongsaroTextMatchesKeywords,
} from "@/domain/nongsaro/cropMapping";
import { fetchNongsaro } from "@/services/nongsaroClient";

export interface NongsaroPestSource {
  sourceId: string;
  title: string;
  publishedAt: string | null;
  attachmentName: string | null;
  attachmentUrl: string | null;
}

function normalizeSource(item: Record<string, string>): NongsaroPestSource | null {
  const sourceId = (item.cntntsNo ?? "").trim();
  const title = (item.cntntsSj ?? "").trim();
  if (!sourceId || !title) return null;

  return {
    sourceId,
    title,
    publishedAt: (item.registDt ?? item.svcDtx ?? item.svcDt ?? "").trim() || null,
    attachmentName: (item.rtnOrginlFileNm ?? "").trim() || null,
    attachmentUrl: normalizeNongsaroUrl(item.downFile ?? null),
  };
}

async function fetchPestOccurrenceList(
  latestYear: string,
  keyword?: string,
  limit = 5,
): Promise<NongsaroPestSource[]> {
  const listResponse = await fetchNongsaro("dbyhsCccrrncInfo", "dbyhsCccrrncInfoList", {
    sYear: latestYear,
    ...(keyword ? { sType: "sCntntsSj", sText: keyword } : {}),
    pageNo: 1,
    numOfRows: Math.max(limit, 5),
  });
  return listResponse.items
    .map(normalizeSource)
    .filter((item): item is NongsaroPestSource => item !== null)
    .slice(0, limit);
}

async function fetchLatestPestYear(): Promise<string> {
  const yearResponse = await fetchNongsaro("dbyhsCccrrncInfo", "dbyhsCccrrncInfoYear");
  return pickLatestYearFromItems(yearResponse.items);
}

function dedupeSources(items: NongsaroPestSource[]): NongsaroPestSource[] {
  const deduped = new Map<string, NongsaroPestSource>();
  for (const item of items) {
    if (!deduped.has(item.sourceId)) {
      deduped.set(item.sourceId, item);
    }
  }
  return Array.from(deduped.values());
}

export async function getPestOccurrenceSources(cropName: string, pestName?: string): Promise<NongsaroPestSource[]> {
  const cropKeyword = cropName.trim();
  if (!cropKeyword) return [];

  const latestYear = await fetchLatestPestYear();
  const profile = getNongsaroCropSearchProfile(cropKeyword);
  const candidateKeyword = (pestName ?? "").trim();
  const searchKeywords = candidateKeyword
    ? [
        ...profile.pestKeywords.map((keyword) => `${keyword} ${candidateKeyword}`),
        candidateKeyword,
        ...profile.pestKeywords,
      ]
    : profile.pestKeywords;

  for (const keyword of Array.from(new Set(searchKeywords.map((item) => item.trim()).filter(Boolean)))) {
    const matches = await fetchPestOccurrenceList(latestYear, keyword);
    if (matches.length > 0) return matches;
  }

  const latest = await fetchPestOccurrenceList(latestYear, undefined, 20);
  const related = latest.filter((source) =>
    nongsaroTextMatchesKeywords(source.title, profile.relatedKeywords),
  );

  return (related.length > 0 ? related : latest).slice(0, 5);
}

export async function getPestOccurrenceSourcesByCandidates(
  cropName: string,
  candidateNames: string[],
): Promise<NongsaroPestSource[]> {
  const uniqueCandidates = Array.from(
    new Set(candidateNames.map((name) => name.trim()).filter(Boolean)),
  ).slice(0, 3);

  const collected: NongsaroPestSource[] = [];
  for (const candidateName of uniqueCandidates) {
    const matched = await getPestOccurrenceSources(cropName, candidateName);
    collected.push(...matched);
  }

  if (collected.length === 0) {
    return getPestOccurrenceSources(cropName);
  }

  return dedupeSources(collected).slice(0, 5);
}
