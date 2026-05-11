import type { StandardRegionCodeRow } from "@/domain/standardRegion/types";
import { dedupeStandardRegionRows, standardRegionSortKey } from "@/domain/standardRegion/standardRegion";
import { fetchStandardRegionCodes } from "@/services/standardRegionClient";

const PAGE_SIZE = 1000;
const MAX_PAGES = 30;

export async function getAllStandardRegionCodes(): Promise<StandardRegionCodeRow[]> {
  const firstPage = await fetchStandardRegionCodes({
    pageNo: 1,
    numOfRows: PAGE_SIZE,
    flag: "Y",
  });

  const totalCount = firstPage.data.totalCount;
  if (totalCount === null || totalCount <= PAGE_SIZE) {
    return dedupeStandardRegionRows(firstPage.data.rows).sort((a, b) =>
      standardRegionSortKey(a).localeCompare(standardRegionSortKey(b)),
    );
  }

  const totalPages = Math.min(Math.ceil(totalCount / PAGE_SIZE), MAX_PAGES);
  const restPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      fetchStandardRegionCodes({
        pageNo: index + 2,
        numOfRows: PAGE_SIZE,
        flag: "Y",
      }),
    ),
  );

  const rows = [firstPage, ...restPages].flatMap((response) => response.data.rows);

  return dedupeStandardRegionRows(rows).sort((a, b) => standardRegionSortKey(a).localeCompare(standardRegionSortKey(b)));
}
