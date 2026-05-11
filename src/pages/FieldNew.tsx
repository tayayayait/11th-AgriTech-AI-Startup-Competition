import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronsUpDown, Loader2, MapPin, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FarmmapView } from "@/components/FarmmapView";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSelectedField } from "@/context/SelectedFieldContext";
import type { FarmmapFieldCandidate, FarmmapLookupResult } from "@/domain/farmmap/types";
import type { FieldFarmmapMeta, FieldRow } from "@/domain/fields/types";
import {
  buildPnuFromLegalRegionLot,
  formatLegalRegionLotAddress,
  isParcelSearchableRegion,
  normalizeLotInput,
} from "@/domain/standardRegion/pnu";
import {
  standardRegionLevel,
  standardRegionSortKey,
} from "@/domain/standardRegion/standardRegion";
import type { StandardRegionCodeRow } from "@/domain/standardRegion/types";
import { createField } from "@/services/fieldService";
import {
  FARMMAP_LAND_CLASSIFICATION_CODES,
  lookupFarmmapAnalysisByAttr,
  lookupFarmmapByBjdAndLandCode,
  lookupFarmmapByLatLng,
  lookupFarmmapByPnu,
} from "@/services/farmmapService";
import { fetchStandardRegionCodes } from "@/services/standardRegionClient";
import { getAllStandardRegionCodes } from "@/services/standardRegionService";
import { toast } from "sonner";

type LocationSource = FieldFarmmapMeta["source"];
type SearchTab = "address" | "region";
type AddressMode = "parcel" | "pnu";
type MapFocusTarget = { id?: string; lat: number; lng: number; zoom?: number };

const PNU_LENGTH = 19;
const REGION_SEARCH_MIN_LENGTH = 2;
const ADDRESS_FARMMAP_REGION_LIMIT = 3;

const CLASSIFICATION_OPTIONS = [
  { value: "all", label: "전체(논, 밭, 과수, 시설)" },
  { value: "논", label: "논" },
  { value: "밭", label: "밭" },
  { value: "과수", label: "과수" },
  { value: "시설", label: "시설" },
] as const;

type ClassificationFilter = (typeof CLASSIFICATION_OPTIONS)[number]["value"];

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

function parseCoordinate(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isValidFieldCoordinate(lat: number | null, lng: number | null): boolean {
  return lat !== null
    && lng !== null
    && lat >= 33
    && lat <= 39.5
    && lng >= 124
    && lng <= 132;
}

function selectedClassification(filter: ClassificationFilter): string | null {
  return filter === "all" ? null : filter;
}

function landCodesForFilter(filter: ClassificationFilter): string[] {
  switch (filter) {
    case "논":
      return [FARMMAP_LAND_CLASSIFICATION_CODES.ricePaddy];
    case "밭":
      return [FARMMAP_LAND_CLASSIFICATION_CODES.field];
    case "과수":
      return [FARMMAP_LAND_CLASSIFICATION_CODES.orchard];
    case "시설":
      return [FARMMAP_LAND_CLASSIFICATION_CODES.facility];
    case "all":
    default:
      return [
        FARMMAP_LAND_CLASSIFICATION_CODES.ricePaddy,
        FARMMAP_LAND_CLASSIFICATION_CODES.field,
        FARMMAP_LAND_CLASSIFICATION_CODES.orchard,
        FARMMAP_LAND_CLASSIFICATION_CODES.facility,
      ];
  }
}

function matchesClassification(candidate: FarmmapFieldCandidate, filter: ClassificationFilter): boolean {
  if (filter === "all") return true;
  return normalizeSearchText(candidate.landClassification).includes(normalizeSearchText(filter));
}

function dedupeCandidates(candidates: FarmmapFieldCandidate[]): FarmmapFieldCandidate[] {
  const deduped = new Map<string, FarmmapFieldCandidate>();
  for (const candidate of candidates) {
    const key = [
      candidate.pnu ?? "",
      candidate.legalDongAddress ?? candidate.address ?? "",
      candidate.lat ?? "",
      candidate.lng ?? "",
      candidate.landClassification ?? "",
    ].join("|");
    if (!deduped.has(key)) deduped.set(key, candidate);
  }
  return Array.from(deduped.values()).slice(0, 30);
}

function filterCandidates(candidates: FarmmapFieldCandidate[], filter: ClassificationFilter): FarmmapFieldCandidate[] {
  return candidates.filter((candidate) => matchesClassification(candidate, filter));
}

function lotTextFromPnu(pnu: string | null | undefined): string | null {
  const digits = pnu?.replace(/\D/g, "") ?? "";
  if (!/^\d{19}$/.test(digits)) return null;

  const mainLot = Number(digits.slice(11, 15));
  if (!Number.isInteger(mainLot) || mainLot <= 0) return null;

  const subLot = Number(digits.slice(15, 19));
  const prefix = digits[10] === "2" ? "산 " : "";
  return `${prefix}${mainLot}${subLot > 0 ? `-${subLot}` : ""}`;
}

function formatFarmmapCandidateAddress(candidate: FarmmapFieldCandidate): string {
  const baseAddress = candidate.legalDongAddress ?? candidate.address ?? candidate.name ?? "팜맵 필지";
  const lotText = lotTextFromPnu(candidate.pnu);
  if (!lotText) return baseAddress;

  const compactBase = baseAddress.replace(/\s+/g, "");
  const compactLot = lotText.replace(/\s+/g, "");
  return compactBase.endsWith(compactLot) ? baseAddress : `${baseAddress} ${lotText}`;
}

function sortFarmmapCandidatesByPnu(candidates: FarmmapFieldCandidate[]): FarmmapFieldCandidate[] {
  return [...candidates].sort((a, b) =>
    (a.pnu ?? formatFarmmapCandidateAddress(a)).localeCompare(b.pnu ?? formatFarmmapCandidateAddress(b)),
  );
}

function candidateToMapFocusTarget(
  candidate: FarmmapFieldCandidate,
  prefix: string,
  zoom = 15,
): MapFocusTarget | null {
  const { lat, lng } = candidate;
  if (lat === null || lng === null || !isValidFieldCoordinate(lat, lng)) return null;
  return {
    id: `${prefix}-${candidate.pnu ?? `${lat}-${lng}`}`,
    lat,
    lng,
    zoom,
  };
}

function firstCandidateWithCoordinate(candidates: FarmmapFieldCandidate[]): FarmmapFieldCandidate | null {
  return candidates.find((candidate) => candidateToMapFocusTarget(candidate, "candidate") !== null) ?? null;
}

function regionDisplayName(region: StandardRegionCodeRow): string {
  return region.lowName ?? region.addressName;
}

function buildFieldName(candidate: FarmmapFieldCandidate): string | null {
  const parts = [candidate.legalDongAddress, candidate.landClassification].filter(Boolean);
  return parts.length ? parts.join(" ") : candidate.name;
}

function sortStandardRegions(rows: StandardRegionCodeRow[]): StandardRegionCodeRow[] {
  return [...rows].sort((a, b) => standardRegionSortKey(a).localeCompare(standardRegionSortKey(b)));
}

function buildFarmmapMeta(
  source: LocationSource,
  candidate: FarmmapFieldCandidate | null,
  classificationFilter: ClassificationFilter,
): FieldFarmmapMeta {
  return {
    source,
    classification: candidate?.landClassification ?? selectedClassification(classificationFilter),
    legalDongAddress: candidate?.legalDongAddress ?? candidate?.address ?? null,
    representativePnu: candidate?.pnu ?? null,
    areaM2: candidate?.areaM2 ?? null,
    raw: candidate?.raw ?? null,
  };
}

function upsertCachedField(fields: FieldRow[] | undefined, field: FieldRow): FieldRow[] {
  const next = new Map((fields ?? []).map((item) => [item.id, item]));
  next.set(field.id, field);
  return Array.from(next.values()).sort((a, b) => b.risk_score - a.risk_score);
}

function sourceLabel(source: LocationSource): string {
  switch (source) {
    case "farmmap_pnu":
      return "PNU 조회";
    case "farmmap_map_click":
      return "지도 클릭";
    case "farmmap_region_lookup":
      return "지역 조건 조회";
    case "manual_coordinate":
      return "좌표 입력";
    case "manual_address":
    default:
      return "지번 조회";
  }
}

function regionOptionsByParent(rows: StandardRegionCodeRow[], parentCode: string, level: ReturnType<typeof standardRegionLevel>) {
  return sortStandardRegions(rows.filter((row) => row.highRegionCode === parentCode && standardRegionLevel(row) === level));
}

export default function FieldNew() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { setSelectedId } = useSelectedField();
  const [activeTab, setActiveTab] = useState<SearchTab>("address");
  const [addressMode, setAddressMode] = useState<AddressMode>("parcel");
  const [name, setName] = useState("");
  const [crop, setCrop] = useState("");
  const [classificationFilter, setClassificationFilter] = useState<ClassificationFilter>("all");
  const [regionQuery, setRegionQuery] = useState("");
  const [standardRegionCandidates, setStandardRegionCandidates] = useState<StandardRegionCodeRow[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<StandardRegionCodeRow | null>(null);
  const [regionRows, setRegionRows] = useState<StandardRegionCodeRow[]>([]);
  const [regionTreeRequested, setRegionTreeRequested] = useState(false);
  const [regionStatus, setRegionStatus] = useState<string | null>("법정동명을 입력하거나 지역 탭에서 행정구역을 선택하세요.");
  const [standardRegionLoading, setStandardRegionLoading] = useState(false);
  const [selectedSidoCode, setSelectedSidoCode] = useState<string | null>(null);
  const [selectedSigunguCode, setSelectedSigunguCode] = useState<string | null>(null);
  const [selectedEupCode, setSelectedEupCode] = useState<string | null>(null);
  const [selectedRiCode, setSelectedRiCode] = useState<string | null>(null);
  const [mainLot, setMainLot] = useState("");
  const [subLot, setSubLot] = useState("");
  const [isMountain, setIsMountain] = useState(false);
  const [minArea, setMinArea] = useState("");
  const [maxArea, setMaxArea] = useState("");
  const [address, setAddress] = useState("");
  const [pnu, setPnu] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [farmmapLoading, setFarmmapLoading] = useState(false);
  const [farmmapCandidates, setFarmmapCandidates] = useState<FarmmapFieldCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<FarmmapFieldCandidate | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource>("manual_address");
  const [farmmapStatus, setFarmmapStatus] = useState<string | null>(null);
  const [mapFocusTarget, setMapFocusTarget] = useState<MapFocusTarget | null>(null);
  const [mapFocusRequestId, setMapFocusRequestId] = useState(0);
  const [mapRegionBjdCode, setMapRegionBjdCode] = useState<string | null>(null);

  const sidoOptions = useMemo(
    () => sortStandardRegions(regionRows.filter((row) => standardRegionLevel(row) === "sido")),
    [regionRows],
  );
  const sigunguOptions = useMemo(
    () => selectedSidoCode ? regionOptionsByParent(regionRows, selectedSidoCode, "sigungu") : [],
    [regionRows, selectedSidoCode],
  );
  const eupOptions = useMemo(
    () => selectedSigunguCode ? regionOptionsByParent(regionRows, selectedSigunguCode, "eupMyeonDong") : [],
    [regionRows, selectedSigunguCode],
  );
  const riOptions = useMemo(
    () => selectedEupCode ? regionOptionsByParent(regionRows, selectedEupCode, "ri") : [],
    [regionRows, selectedEupCode],
  );
  const selectedTreeRegion = useMemo(() => {
    const code = selectedRiCode ?? selectedEupCode;
    return regionRows.find((row) => row.regionCode === code) ?? null;
  }, [regionRows, selectedEupCode, selectedRiCode]);

  const effectiveRegion = activeTab === "region" ? selectedTreeRegion : selectedRegion;
  const latNum = useMemo(() => parseCoordinate(lat), [lat]);
  const lngNum = useMemo(() => parseCoordinate(lng), [lng]);
  const hasValidCoordInput = isValidFieldCoordinate(latNum, lngNum);
  const filteredFarmmapCandidates = useMemo(
    () => filterCandidates(farmmapCandidates, classificationFilter),
    [farmmapCandidates, classificationFilter],
  );
  const builtPnu = useMemo(() => {
    if (!effectiveRegion) return null;
    return buildPnuFromLegalRegionLot({
      regionCode: effectiveRegion.regionCode,
      mainLot,
      subLot,
      isMountain,
    });
  }, [effectiveRegion, isMountain, mainLot, subLot]);
  const builtAddress = useMemo(() => {
    if (!effectiveRegion) return "";
    return formatLegalRegionLotAddress(effectiveRegion.addressName, mainLot, subLot, isMountain);
  }, [effectiveRegion, isMountain, mainLot, subLot]);
  const hasAreaFilter = minArea.trim().length > 0 || maxArea.trim().length > 0;
  const activeFarmmapLandCodes = useMemo(
    () => landCodesForFilter(classificationFilter),
    [classificationFilter],
  );

  const draftField = useMemo<FieldRow | null>(() => {
    if (!hasValidCoordInput || latNum === null || lngNum === null) return null;
    return {
      id: "draft-field",
      name: name.trim() || "등록 위치",
      address: address.trim() || selectedCandidate?.address || selectedCandidate?.legalDongAddress || null,
      lat: latNum,
      lng: lngNum,
      crop_name: crop.trim() || "작물 미입력",
      growth_stage: null,
      area_m2: selectedCandidate?.areaM2 ?? 0,
      pnu: selectedCandidate?.pnu ?? (pnu || null),
      farmmap_meta: buildFarmmapMeta(locationSource, selectedCandidate, classificationFilter),
      risk_level: "unknown",
      risk_score: 0,
      updated_at: new Date().toISOString(),
    };
  }, [
    address,
    classificationFilter,
    crop,
    hasValidCoordInput,
    latNum,
    lngNum,
    locationSource,
    name,
    pnu,
    selectedCandidate,
  ]);

  const clearSelection = () => {
    setSelectedCandidate(null);
    setFarmmapCandidates([]);
    setFarmmapStatus(null);
    setMapRegionBjdCode(null);
  };

  const focusMapOnCandidate = useCallback((candidate: FarmmapFieldCandidate, prefix: string, zoom = 15) => {
    const focusTarget = candidateToMapFocusTarget(candidate, prefix, zoom);
    if (!focusTarget) return false;
    setMapFocusTarget(focusTarget);
    setMapFocusRequestId((current) => current + 1);
    return true;
  }, []);

  const applyFarmmapCandidate = useCallback((candidate: FarmmapFieldCandidate, source: LocationSource) => {
    setSelectedCandidate(candidate);
    setLocationSource(source);
    const candidateBjdCode = candidate.pnu?.replace(/\D/g, "").slice(0, 10);
    if (candidateBjdCode && /^\d{10}$/.test(candidateBjdCode)) setMapRegionBjdCode(candidateBjdCode);
    if (candidate.pnu) setPnu(candidate.pnu.replace(/\D/g, "").slice(0, PNU_LENGTH));
    if (candidate.address || candidate.legalDongAddress) setAddress(candidate.address ?? candidate.legalDongAddress ?? "");
    if (candidate.lat !== null) setLat(String(candidate.lat));
    if (candidate.lng !== null) setLng(String(candidate.lng));
    if (!name.trim()) {
      const candidateName = buildFieldName(candidate);
      if (candidateName) setName(candidateName);
    }
    focusMapOnCandidate(candidate, "farmmap-result");
    setFarmmapStatus("팜맵 결과를 선택했습니다.");
  }, [focusMapOnCandidate, name]);

  const lookupRepresentativeRegionCandidate = useCallback(async (targetRegions: StandardRegionCodeRow[]) => {
    const allLandCodes = landCodesForFilter("all");

    if (targetRegions.length === 1) {
      const region = targetRegions[0];
      const result = await lookupFarmmapByBjdAndLandCode(region.regionCode, allLandCodes);
      const candidate = firstCandidateWithCoordinate(dedupeCandidates(result.candidates));
      return candidate ? { region, candidate } : null;
    }

    for (const landCode of allLandCodes) {
      const results = await Promise.allSettled(
        targetRegions.map((region) => lookupFarmmapByBjdAndLandCode(region.regionCode, [landCode])),
      );

      for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        if (result.status !== "fulfilled") continue;
        const candidate = firstCandidateWithCoordinate(dedupeCandidates(result.value.candidates));
        if (candidate) return { region: targetRegions[index], candidate };
      }
    }

    return null;
  }, []);

  const lookupAddressFarmmapCandidates = useCallback(async (regions: StandardRegionCodeRow[]) => {
    const lookupRegions = regions.slice(0, ADDRESS_FARMMAP_REGION_LIMIT);
    const allLandCodes = landCodesForFilter("all");
    const results = await Promise.allSettled(
      lookupRegions.map((region) => lookupFarmmapByBjdAndLandCode(region.regionCode, allLandCodes)),
    );

    const candidates = results.flatMap((result) =>
      result.status === "fulfilled" ? sortFarmmapCandidatesByPnu(result.value.candidates) : [],
    );
    return dedupeCandidates(candidates);
  }, []);

  const loadRegionTree = useCallback(async () => {
    if (regionRows.length > 0 || standardRegionLoading) return;
    setRegionTreeRequested(true);
    setStandardRegionLoading(true);
    setRegionStatus("행정표준코드 API에서 지역 코드를 불러오는 중입니다.");
    try {
      const rows = await getAllStandardRegionCodes();
      setRegionRows(rows);
      setRegionStatus(`지역 코드 ${rows.length.toLocaleString()}건을 불러왔습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "지역 코드 조회에 실패했습니다.";
      setRegionStatus(
        message.includes("Failed to fetch")
          ? "법정동코드 API 프록시 배포 또는 STANDARD_REGION_API_KEY 설정이 필요합니다."
          : message,
      );
    } finally {
      setStandardRegionLoading(false);
    }
  }, [regionRows.length, standardRegionLoading]);

  useEffect(() => {
    if (activeTab === "region" && !regionTreeRequested) {
      void loadRegionTree();
    }
  }, [activeTab, loadRegionTree, regionTreeRequested]);

  const updateRegionQuery = (value: string) => {
    setRegionQuery(value);
    setSelectedRegion(null);
    setStandardRegionCandidates([]);
    setRegionStatus(null);
    clearSelection();
    setAddress("");
    setLocationSource("manual_address");
  };

  const selectStandardRegion = (row: StandardRegionCodeRow) => {
    setSelectedRegion(row);
    setRegionQuery(row.addressName);
    setAddress(row.addressName);
    setRegionStatus(`${row.addressName} / 법정동코드 ${row.regionCode}`);
    clearSelection();
    setLocationSource("manual_address");
  };

  const searchStandardRegions = async () => {
    const query = regionQuery.trim();
    if (query.length < REGION_SEARCH_MIN_LENGTH) {
      setRegionStatus("법정동 검색어는 2자 이상 입력하세요.");
      return;
    }

    setStandardRegionLoading(true);
    setFarmmapLoading(true);
    setRegionStatus(null);
    setStandardRegionCandidates([]);
    setFarmmapCandidates([]);
    setSelectedRegion(null);
    setSelectedCandidate(null);
    setMapRegionBjdCode(null);

    try {
      const response = await fetchStandardRegionCodes({
        locatadd_nm: query,
        pageNo: 1,
        numOfRows: 50,
        flag: "Y",
      });
      const candidates = sortStandardRegions(response.data.rows).filter(isParcelSearchableRegion);
      setStandardRegionCandidates(candidates);

      if (candidates.length === 0) {
        setRegionStatus("본번/부번을 붙일 수 있는 법정동 또는 리 코드가 없습니다.");
        return;
      }

      const farmmapAddressCandidates = await lookupAddressFarmmapCandidates(candidates);
      setFarmmapCandidates(farmmapAddressCandidates);
      setRegionStatus(
        farmmapAddressCandidates.length
          ? `팜맵 필지 후보 ${farmmapAddressCandidates.length.toLocaleString()}건`
          : `법정동 후보 ${candidates.length.toLocaleString()}건. 팜맵 필지 후보가 없으면 법정동을 선택한 뒤 본번/부번으로 조회하세요.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "법정동코드 조회에 실패했습니다.";
      setRegionStatus(
        message.includes("Failed to fetch")
          ? "법정동코드 API 프록시 배포 또는 STANDARD_REGION_API_KEY 설정이 필요합니다."
          : message,
      );
    } finally {
      setStandardRegionLoading(false);
      setFarmmapLoading(false);
    }
  };

  const lookupPnuValue = async (pnuValue: string, source: LocationSource = "farmmap_pnu") => {
    if (!/^\d{19}$/.test(pnuValue)) {
      toast.error("PNU는 숫자 19자리여야 합니다.");
      return;
    }

    setFarmmapLoading(true);
    setFarmmapStatus(null);
    setFarmmapCandidates([]);
    setSelectedCandidate(null);
    setMapRegionBjdCode(null);

    try {
      const result = await lookupFarmmapByPnu(pnuValue);
      const deduped = dedupeCandidates(result.candidates);
      setFarmmapCandidates(deduped);
      setPnu(pnuValue);

      if (!deduped.length) {
        setFarmmapStatus("PNU 조회 결과가 없습니다.");
        return;
      }

      const firstMatch = deduped.find((candidate) => matchesClassification(candidate, classificationFilter)) ?? deduped[0];
      applyFarmmapCandidate(firstMatch, source);
      setFarmmapStatus(`필지목록 ${deduped.length.toLocaleString()}건`);
    } catch (error) {
      setFarmmapStatus(null);
      toast.error(error instanceof Error ? error.message : "팜맵 PNU 조회에 실패했습니다.");
    } finally {
      setFarmmapLoading(false);
    }
  };

  const searchBuiltPnu = async () => {
    if (!effectiveRegion) {
      toast.error("법정동 또는 행정구역을 먼저 선택하세요.");
      return;
    }
    if (!builtPnu) {
      toast.error("본번은 1 이상 9999 이하 숫자로 입력하세요.");
      return;
    }

    setAddress(builtAddress);
    await lookupPnuValue(builtPnu, "farmmap_pnu");
  };

  const searchRegionConditions = async () => {
    if (!selectedTreeRegion) {
      toast.error("읍·면·동 또는 리를 선택하세요.");
      return;
    }

    if (mainLot.trim()) {
      if (!selectedRiCode && selectedEupCode && riOptions.length > 0) {
        toast.error("지번으로 조회하려면 리까지 선택하세요.");
        return;
      }
      await searchBuiltPnu();
      return;
    }

    const min = parsePositiveNumber(minArea);
    const max = parsePositiveNumber(maxArea);
    if ((minArea.trim() && min === null) || (maxArea.trim() && max === null)) {
      toast.error("면적은 0 이상 숫자로 입력하세요.");
      return;
    }

    setFarmmapLoading(true);
    setFarmmapStatus(null);
    setFarmmapCandidates([]);
    setSelectedCandidate(null);
    setAddress("");
    setPnu("");
    setLat("");
    setLng("");
    setMapRegionBjdCode(null);
    setLocationSource("farmmap_region_lookup");

    try {
      const landCodes = activeFarmmapLandCodes;
      const targetRegions = !selectedRiCode && selectedEupCode && riOptions.length > 0
        ? riOptions
        : [selectedTreeRegion];
      let candidates: FarmmapFieldCandidate[] = [];
      let matchedRegion: StandardRegionCodeRow | null = null;

      if (targetRegions.length > 1) {
        for (const landCode of landCodes) {
          setFarmmapStatus(`하위 리 ${targetRegions.length}곳을 조회 중입니다.`);
          const results = await Promise.allSettled(
            targetRegions.map((region) =>
              hasAreaFilter
                ? lookupFarmmapAnalysisByAttr({
                  bjdCd: region.regionCode,
                  landCodes: [landCode],
                  fromBaseArea: min,
                  toBaseArea: max,
                })
                : lookupFarmmapByBjdAndLandCode(region.regionCode, [landCode]),
            ),
          );
          const matchIndex = results.findIndex(
            (result) => result.status === "fulfilled" && result.value.candidates.length > 0,
          );
          if (matchIndex === -1) continue;

          matchedRegion = targetRegions[matchIndex];
          const matchResult = results[matchIndex] as PromiseFulfilledResult<FarmmapLookupResult>;
          candidates = matchResult.value.candidates;
          if (!hasAreaFilter && landCodes.length > 1) {
            const fullRegionResult = await lookupFarmmapByBjdAndLandCode(matchedRegion.regionCode, landCodes);
            candidates = fullRegionResult.candidates;
          }
          break;
        }
      } else {
        const result = hasAreaFilter
          ? await lookupFarmmapAnalysisByAttr({
            bjdCd: selectedTreeRegion.regionCode,
            landCodes,
            fromBaseArea: min,
            toBaseArea: max,
          })
          : await lookupFarmmapByBjdAndLandCode(selectedTreeRegion.regionCode, landCodes);
        matchedRegion = selectedTreeRegion;
        candidates = result.candidates;
      }

      const deduped = dedupeCandidates(candidates);
      setFarmmapCandidates(deduped);

      if (!deduped.length) {
        const shouldFindRepresentativeRegion = classificationFilter !== "all" || hasAreaFilter;
        const representative = shouldFindRepresentativeRegion
          ? await lookupRepresentativeRegionCandidate(targetRegions)
          : null;

        if (representative && focusMapOnCandidate(representative.candidate, "region-representative", 14)) {
          setMapRegionBjdCode(representative.region.regionCode);
          setFarmmapStatus(
            `${regionDisplayName(representative.region)}으로 지도를 이동했습니다. 선택한 조건의 필지 결과는 없습니다.`,
          );
          return;
        }

        const noResultMessage = targetRegions.length > 1
          ? `하위 리 ${targetRegions.length}곳을 조회했지만 검색결과가 없습니다.`
          : "검색결과가 없습니다.";
        setFarmmapStatus(
          `${noResultMessage} 현재 제공 API에서 이 지역의 지도 이동용 팜맵 좌표도 찾지 못했습니다.`,
        );
        return;
      }

      const firstMatch = deduped.find((candidate) => matchesClassification(candidate, classificationFilter)) ?? deduped[0];
      if (matchedRegion) setMapRegionBjdCode(matchedRegion.regionCode);
      applyFarmmapCandidate(firstMatch, "farmmap_region_lookup");
      setFarmmapStatus(
        targetRegions.length > 1 && matchedRegion
          ? `${regionDisplayName(matchedRegion)} 기준 필지목록 ${deduped.length.toLocaleString()}건`
          : `필지목록 ${deduped.length.toLocaleString()}건`,
      );
    } catch (error) {
      setFarmmapStatus(null);
      toast.error(error instanceof Error ? error.message : "지역 조건 팜맵 조회에 실패했습니다.");
    } finally {
      setFarmmapLoading(false);
    }
  };

  const lookupCoordinate = useCallback(async (
    targetLat: number | null,
    targetLng: number | null,
    source: LocationSource = "manual_coordinate",
  ) => {
    if (!isValidFieldCoordinate(targetLat, targetLng) || targetLat === null || targetLng === null) return;

    setFarmmapLoading(true);
    setFarmmapStatus("좌표 기반 팜맵 조회 중입니다.");
    setFarmmapCandidates([]);
    setSelectedCandidate(null);
    setMapRegionBjdCode(null);
    setLocationSource(source);

    try {
      const result = await lookupFarmmapByLatLng(targetLat, targetLng);
      const deduped = dedupeCandidates(result.candidates);
      setFarmmapCandidates(deduped);
      if (!deduped.length) {
        setFarmmapStatus("선택 좌표의 검색결과가 없습니다.");
        return;
      }
      const firstMatch = deduped.find((candidate) => matchesClassification(candidate, classificationFilter)) ?? deduped[0];
      applyFarmmapCandidate(firstMatch, source);
      setFarmmapStatus(`필지목록 ${deduped.length.toLocaleString()}건`);
    } catch (error) {
      setFarmmapStatus("좌표 조회에 실패했습니다.");
      if (error instanceof Error) toast.error(error.message);
    } finally {
      setFarmmapLoading(false);
    }
  }, [applyFarmmapCandidate, classificationFilter]);

  const handleMapClick = useCallback(async (point: { lat: number; lng: number }) => {
    setLat(point.lat.toFixed(7));
    setLng(point.lng.toFixed(7));
    await lookupCoordinate(point.lat, point.lng, "farmmap_map_click");
  }, [lookupCoordinate]);

  const selectSido = (code: string) => {
    setSelectedSidoCode(code);
    setSelectedSigunguCode(null);
    setSelectedEupCode(null);
    setSelectedRiCode(null);
    clearSelection();
  };

  const selectSigungu = (code: string) => {
    setSelectedSigunguCode(code);
    setSelectedEupCode(null);
    setSelectedRiCode(null);
    clearSelection();
  };

  const selectEup = (code: string) => {
    setSelectedEupCode(code);
    setSelectedRiCode(null);
    clearSelection();
  };

  const submit = async (source: LocationSource) => {
    const trimmedName = name.trim();
    const trimmedCrop = crop.trim();
    const trimmedAddress = address.trim();
    const submitLat = parseCoordinate(lat);
    const submitLng = parseCoordinate(lng);

    if (!trimmedName || !trimmedCrop) {
      toast.error("필지명과 작물명을 입력하세요.");
      return;
    }
    if (!isValidFieldCoordinate(submitLat, submitLng) || submitLat === null || submitLng === null) {
      toast.error("등록 가능한 실제 좌표가 필요합니다.");
      return;
    }

    try {
      const created = await createField({
        name: trimmedName,
        cropName: trimmedCrop,
        address: trimmedAddress || selectedCandidate?.address || selectedCandidate?.legalDongAddress || null,
        lat: submitLat,
        lng: submitLng,
        areaM2: selectedCandidate?.areaM2 ?? 0,
        pnu: selectedCandidate?.pnu ?? (pnu.length === PNU_LENGTH ? pnu : null),
        farmmapMeta: buildFarmmapMeta(source, selectedCandidate, classificationFilter),
      });

      queryClient.setQueryData<FieldRow[]>(["fields"], (current) => upsertCachedField(current, created));
      queryClient.setQueryData<FieldRow[]>(["fields-all"], (current) => upsertCachedField(current, created));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fields"] }),
        queryClient.invalidateQueries({ queryKey: ["fields-all"] }),
      ]);
      setSelectedId(created.id);
      toast.success("필지가 등록되었습니다.");
      nav("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "필지 등록 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="-m-4 bg-slate-900 md:-m-6">
      <div className="relative flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden lg:block">
        <FarmmapView
          fields={draftField ? [draftField] : []}
          className="h-[420px] rounded-none lg:absolute lg:inset-0 lg:h-full"
          onMapClick={handleMapClick}
          showStatusOverlay={false}
          farmmapLandCodes={activeFarmmapLandCodes}
          farmmapBjdCode={mapRegionBjdCode}
          focusTarget={mapFocusTarget}
          focusRequestId={mapFocusRequestId}
        />
        <div className="pointer-events-none absolute inset-0 z-[1500] bg-[linear-gradient(90deg,rgba(15,23,42,0.2),rgba(15,23,42,0.02)_52%,rgba(15,23,42,0.12))]" />

        <FarmmapHeader />

        <section className="z-[2000] m-3 flex min-h-[560px] flex-col overflow-hidden rounded-md border bg-background/95 shadow-xl backdrop-blur lg:absolute lg:bottom-3 lg:left-3 lg:top-20 lg:m-0 lg:w-[340px]">
          <div className="border-b px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold">
                <MapPin className="h-4 w-4 text-primary" />
                팜맵 검색
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearSelection} aria-label="검색 결과 초기화">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <Tabs value={activeTab} onValueChange={(next) => setActiveTab(next as SearchTab)}>
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-none border bg-muted/30 p-0">
                <TabsTrigger value="address" className="h-full rounded-none border-r data-[state=active]:bg-background data-[state=active]:text-primary">
                  주소
                </TabsTrigger>
                <TabsTrigger value="region" className="h-full rounded-none data-[state=active]:bg-background data-[state=active]:text-primary">
                  지역
                </TabsTrigger>
              </TabsList>

              <TabsContent value="address" className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <Select value={addressMode} onValueChange={(next) => setAddressMode(next as AddressMode)}>
                    <SelectTrigger className="h-10 w-[86px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="parcel">지번</SelectItem>
                      <SelectItem value="pnu">PNU</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={addressMode === "pnu" ? pnu : regionQuery}
                      onChange={(event) => {
                        if (addressMode === "pnu") {
                          setPnu(event.target.value.replace(/\D/g, "").slice(0, PNU_LENGTH));
                          clearSelection();
                          return;
                        }
                        updateRegionQuery(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        if (addressMode === "pnu") void lookupPnuValue(pnu, "farmmap_pnu");
                        else void searchStandardRegions();
                      }}
                      placeholder={addressMode === "pnu" ? "PNU 19자리" : "검색어를 입력해 주세요"}
                      className="pl-9"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0 bg-background"
                    disabled={farmmapLoading || standardRegionLoading}
                    onClick={() => {
                      if (addressMode === "pnu") void lookupPnuValue(pnu, "farmmap_pnu");
                      else void searchStandardRegions();
                    }}
                    aria-label="검색"
                  >
                    {farmmapLoading || standardRegionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {addressMode === "parcel" && (
                  <>
                    <StatusText text={regionStatus} />
                    <StandardRegionCandidateList
                      candidates={farmmapCandidates.length > 0 ? [] : standardRegionCandidates}
                      selected={selectedRegion}
                      loading={standardRegionLoading}
                      onSelect={selectStandardRegion}
                    />
                    {farmmapCandidates.length === 0 && (
                      <>
                        <LotBox
                          mainLot={mainLot}
                          subLot={subLot}
                          isMountain={isMountain}
                          builtPnu={builtPnu}
                          onMainLotChange={setMainLot}
                          onSubLotChange={setSubLot}
                          onMountainChange={setIsMountain}
                        />
                        <Button
                          type="button"
                          className="w-full"
                          disabled={!builtPnu || farmmapLoading}
                          onClick={() => void searchBuiltPnu()}
                        >
                          {farmmapLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                          법정동+지번으로 PNU 조회
                        </Button>
                      </>
                    )}
                  </>
                )}
                <FarmmapCandidateList
                  candidates={farmmapCandidates}
                  selected={selectedCandidate}
                  loading={farmmapLoading}
                  emptyMessage="검색결과가 없습니다."
                  onSelect={(candidate) => applyFarmmapCandidate(candidate, locationSource)}
                />
              </TabsContent>

              <TabsContent value="region" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">지역 *</Label>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void loadRegionTree()}>
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                      코드 갱신
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <RegionSelect label="시도" value={selectedSidoCode} options={sidoOptions} disabled={standardRegionLoading} onChange={selectSido} />
                    <RegionSelect label="시군구" value={selectedSigunguCode} options={sigunguOptions} disabled={!selectedSidoCode || standardRegionLoading} onChange={selectSigungu} />
                    <RegionSelect label="읍면동" value={selectedEupCode} options={eupOptions} disabled={!selectedSigunguCode || standardRegionLoading} onChange={selectEup} />
                    <RegionSelect label="리" value={selectedRiCode} options={riOptions} disabled={!selectedEupCode || riOptions.length === 0 || standardRegionLoading} onChange={setSelectedRiCode} />
                  </div>
                  <StatusText text={farmmapStatus ?? regionStatus} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">번지</Label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>산</span>
                      <Checkbox checked={isMountain} onCheckedChange={(checked) => setIsMountain(checked === true)} />
                    </label>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                    <Field label="본번" value={mainLot} onChange={(value) => setMainLot(normalizeLotInput(value))} placeholder="본번" />
                    <div className="pb-3 text-muted-foreground">~</div>
                    <Field label="부번" value={subLot} onChange={(value) => setSubLot(normalizeLotInput(value))} placeholder="부번" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">면적(m²)</Label>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <Input value={minArea} onChange={(event) => setMinArea(event.target.value.replace(/[^\d.]/g, ""))} placeholder="최소" />
                    <span className="text-muted-foreground">~</span>
                    <Input value={maxArea} onChange={(event) => setMaxArea(event.target.value.replace(/[^\d.]/g, ""))} placeholder="최대" />
                  </div>
                </div>

                <ClassificationSelect value={classificationFilter} onChange={setClassificationFilter} />

                <Button
                  type="button"
                  className="w-full"
                  disabled={!selectedTreeRegion || farmmapLoading || standardRegionLoading}
                  onClick={() => void searchRegionConditions()}
                >
                  {farmmapLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  검색하기
                </Button>

                <FarmmapCandidateList
                  candidates={filteredFarmmapCandidates}
                  selected={selectedCandidate}
                  loading={farmmapLoading}
                  emptyMessage="검색결과가 없습니다."
                  onSelect={(candidate) => applyFarmmapCandidate(candidate, "farmmap_region_lookup")}
                />
              </TabsContent>
            </Tabs>
          </div>
        </section>

        <FieldInfoPanel
          field={draftField}
          source={sourceLabel(locationSource)}
          loading={farmmapLoading || standardRegionLoading}
          status={farmmapStatus ?? regionStatus}
          name={name}
          crop={crop}
          onNameChange={setName}
          onCropChange={setCrop}
          canSubmit={hasValidCoordInput && !standardRegionLoading && !farmmapLoading}
          onSubmit={() => void submit(locationSource)}
        />
      </div>
    </div>
  );
}

function FarmmapHeader() {
  return (
    <div className="z-[2000] m-3 rounded-md border bg-background/95 px-4 py-3 shadow-lg backdrop-blur lg:absolute lg:left-3 lg:right-3 lg:top-3 lg:m-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 pr-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-sm font-bold text-primary-foreground">
            F
          </div>
          <div>
            <div className="text-sm font-bold leading-none text-primary">FARMMAP</div>
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">FieldGuard AI</div>
          </div>
        </div>
        <div className="hidden items-center gap-2 border-l pl-4 text-xs text-muted-foreground md:flex">
          <span className="rounded-sm bg-primary px-2 py-1 font-medium text-primary-foreground">팜맵 검색</span>
          <span className="rounded-sm border bg-background px-2 py-1">PNU</span>
          <span className="rounded-sm border bg-background px-2 py-1">지역 조건</span>
          <span className="rounded-sm border bg-background px-2 py-1">필지 등록</span>
        </div>
      </div>
    </div>
  );
}

function StatusText({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="text-xs leading-5 text-muted-foreground">{text}</p>;
}

function ClassificationSelect({
  value,
  onChange,
}: {
  value: ClassificationFilter;
  onChange: (value: ClassificationFilter) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold">분류</Label>
      <Select value={value} onValueChange={(next) => onChange(next as ClassificationFilter)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CLASSIFICATION_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RegionSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  options: StandardRegionCodeRow[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value ?? ""} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.regionCode} value={option.regionCode}>
            {regionSelectLabel(label, option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function regionSelectLabel(label: string, option: StandardRegionCodeRow): string {
  if (label === "시군구") {
    const [, ...lowerParts] = option.addressName.split(/\s+/);
    return lowerParts.join(" ") || option.lowName || option.addressName;
  }
  return option.lowName ?? option.addressName;
}

function LotBox({
  mainLot,
  subLot,
  isMountain,
  builtPnu,
  onMainLotChange,
  onSubLotChange,
  onMountainChange,
}: {
  mainLot: string;
  subLot: string;
  isMountain: boolean;
  builtPnu: string | null;
  onMainLotChange: (value: string) => void;
  onSubLotChange: (value: string) => void;
  onMountainChange: (value: boolean) => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border bg-surface-muted p-3">
      <div className="text-xs font-medium">지번 입력</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="본번" value={mainLot} onChange={(value) => onMainLotChange(normalizeLotInput(value))} placeholder="155" />
        <Field label="부번" value={subLot} onChange={(value) => onSubLotChange(normalizeLotInput(value))} placeholder="0" />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Checkbox checked={isMountain} onCheckedChange={(checked) => onMountainChange(checked === true)} />
        산 번지
      </label>
      <div className="rounded-sm border bg-background px-3 py-2 text-xs">
        <div className="text-muted-foreground">생성 PNU</div>
        <div className="mt-1 font-medium">{builtPnu ?? "법정동과 본번을 입력하세요."}</div>
      </div>
    </div>
  );
}

function FieldInfoPanel({
  field,
  source,
  loading,
  status,
  name,
  crop,
  onNameChange,
  onCropChange,
  canSubmit,
  onSubmit,
}: {
  field: FieldRow | null;
  source: string;
  loading: boolean;
  status: string | null;
  name: string;
  crop: string;
  onNameChange: (value: string) => void;
  onCropChange: (value: string) => void;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <aside className="z-[2000] m-3 rounded-md border bg-background/95 p-4 shadow-lg backdrop-blur lg:absolute lg:bottom-3 lg:left-[365px] lg:right-3 lg:m-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            {!loading && <CheckCircle2 className="h-4 w-4 text-primary" />}
            선택 필지 정보
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{status ?? "검색 조건으로 필지를 선택하세요."}</p>
        </div>
        <div className="rounded-sm border bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
          입력 방식: <span className="font-medium text-foreground">{source}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px] lg:items-end">
        <Field label="필지명" value={name} onChange={onNameChange} placeholder="예: 배추 - 해룡면" />
        <Field label="작물명" value={crop} onChange={onCropChange} placeholder="예: 배추" />
        <Button className="h-10 w-full" disabled={!canSubmit} onClick={onSubmit}>
          <CheckCircle2 className="h-4 w-4" />
          선택한 필지 등록
        </Button>
      </div>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <InfoItem label="좌표" value={field ? `${field.lat.toFixed(7)}, ${field.lng.toFixed(7)}` : "미입력"} />
        <InfoItem label="PNU" value={field?.pnu ?? "미입력"} />
        <InfoItem label="법정동주소" value={field?.farmmap_meta.legalDongAddress ?? field?.address ?? "미입력"} />
        <InfoItem label="분류/면적" value={field ? [field.farmmap_meta.classification, field.area_m2 ? `${field.area_m2.toLocaleString()}㎡` : null].filter(Boolean).join(" · ") || "미입력" : "미입력"} />
      </div>
    </aside>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-sm border bg-background px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  );
}

function StandardRegionCandidateList({
  candidates,
  selected,
  loading,
  onSelect,
}: {
  candidates: StandardRegionCodeRow[];
  selected: StandardRegionCodeRow | null;
  loading: boolean;
  onSelect: (candidate: StandardRegionCodeRow) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        법정동코드를 조회하는 중입니다.
      </div>
    );
  }

  if (candidates.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium">
        <span>법정동 후보({candidates.length.toLocaleString()}건)</span>
        <span className="text-muted-foreground">region_cd</span>
      </div>
      {candidates.slice(0, 6).map((candidate) => {
        const isSelected = selected?.regionCode === candidate.regionCode;
        return (
          <button
            type="button"
            key={candidate.regionCode}
            className={`w-full rounded-md border p-3 text-left text-xs transition-colors hover:bg-muted/30 ${
              isSelected ? "border-primary bg-primary/5" : "border-border bg-background"
            }`}
            onClick={() => onSelect(candidate)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{candidate.addressName}</span>
              {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
            </div>
            <div className="mt-1 text-muted-foreground">{candidate.regionCode}</div>
          </button>
        );
      })}
    </div>
  );
}

function FarmmapCandidateList({
  candidates,
  selected,
  loading = false,
  emptyMessage,
  onSelect,
}: {
  candidates: FarmmapFieldCandidate[];
  selected: FarmmapFieldCandidate | null;
  loading?: boolean;
  emptyMessage?: string;
  onSelect: (candidate: FarmmapFieldCandidate) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        팜맵 필지 정보를 조회하는 중입니다.
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="rounded-md border bg-muted/10 p-3 text-center text-xs leading-5 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-dashed pt-4">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span>필지목록({candidates.length.toLocaleString()}건)</span>
        <span className="text-muted-foreground">PNU</span>
      </div>
      {candidates.map((candidate, index) => {
        const isSelected = selected === candidate;
        return (
          <button
            type="button"
            key={`${candidate.pnu ?? "candidate"}-${index}`}
            className={`w-full rounded-md border p-3 text-left text-xs transition-colors hover:bg-muted/30 ${
              isSelected ? "border-primary bg-primary/5" : "border-border bg-background"
            }`}
            onClick={() => onSelect(candidate)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium">
                {formatFarmmapCandidateAddress(candidate) || `후보 ${index + 1}`}
              </span>
              {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
            </div>
            <div className="mt-1 truncate text-muted-foreground">
              {[candidate.pnu, candidate.landClassification, candidate.areaM2 ? `${candidate.areaM2.toLocaleString()}㎡` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="text-muted-foreground">
              {candidate.lat !== null && candidate.lng !== null ? `${candidate.lat.toFixed(7)}, ${candidate.lng.toFixed(7)}` : "좌표 정보 없음"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}
