export interface FarmmapFieldCandidate {
  name: string | null;
  address: string | null;
  pnu: string | null;
  lat: number | null;
  lng: number | null;
  areaM2: number | null;
  landClassification: string | null;
  legalDongAddress: string | null;
  raw: Record<string, unknown>;
}

export interface FarmmapLookupResult {
  fetchedAt: string;
  candidates: FarmmapFieldCandidate[];
  raw: unknown;
}

export interface FarmmapMapExtent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  epsg: "EPSG:5179";
  featureCount: number;
}

export interface FarmmapRegionMapLookupResult {
  fetchedAt: string;
  extent: FarmmapMapExtent | null;
  candidates: FarmmapFieldCandidate[];
  raw: unknown;
}

export interface FarmmapAnalysisRecord {
  pnu: string | null;
  raw: Record<string, unknown>;
}

export interface FarmmapAnalysisLookupResult {
  fetchedAt: string;
  records: FarmmapAnalysisRecord[];
  raw: unknown;
}
