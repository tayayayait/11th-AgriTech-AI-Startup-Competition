export interface StandardRegionCodeRow {
  regionCode: string;
  sidoCode: string;
  sigunguCode: string;
  eupMyeonDongCode: string;
  riCode: string;
  residentRegionCode: string | null;
  cadastralRegionCode: string | null;
  addressName: string;
  order: string | null;
  note: string | null;
  highRegionCode: string;
  lowName: string | null;
  createdDate: string | null;
  raw: Record<string, unknown>;
}

export type StandardRegionLevel = "sido" | "sigungu" | "eupMyeonDong" | "ri" | "unknown";

export interface StandardRegionCodeResult {
  totalCount: number | null;
  pageNo: number | null;
  numOfRows: number | null;
  rows: StandardRegionCodeRow[];
}
