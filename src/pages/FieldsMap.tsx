import { useQuery } from "@tanstack/react-query";
import { Check, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FarmmapView } from "@/components/FarmmapView";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildFarmmapFieldDetail } from "@/domain/farmmap/detail";
import type { FarmmapFieldCandidate, FarmmapMapExtent } from "@/domain/farmmap/types";
import type { FieldRow } from "@/domain/fields/types";
import {
  parentRegionCode,
  standardRegionLevel,
} from "@/domain/standardRegion/standardRegion";
import { getFarmmapPolygonExtent } from "@/domain/farmmap/map";
import type { StandardRegionCodeRow, StandardRegionLevel } from "@/domain/standardRegion/types";
import { cn } from "@/lib/utils";
import { lookupFarmmapRegionMap } from "@/services/farmmapService";
import { getAllStandardRegionCodes } from "@/services/standardRegionService";

const UNSELECTED = "__unselected__";

const LAND_CLASSIFICATION_FILTERS = [
  { value: "all", label: "전체(논, 밭, 과수, 시설)", codes: ["01", "02", "03", "04"] },
  { value: "01", label: "논", codes: ["01"] },
  { value: "02", label: "밭", codes: ["02"] },
  { value: "03", label: "과수", codes: ["03"] },
  { value: "04", label: "시설", codes: ["04"] },
  { value: "06", label: "비경지", codes: ["06"] },
];

function childrenOf(
  rows: StandardRegionCodeRow[],
  parentCode: string,
  level: StandardRegionLevel,
): StandardRegionCodeRow[] {
  if (parentCode === UNSELECTED) return [];
  return rows.filter((row) => {
    if (standardRegionLevel(row) !== level) return false;
    return row.highRegionCode === parentCode || parentRegionCode(row.regionCode) === parentCode;
  });
}

function selectedRegionLabel(rows: StandardRegionCodeRow[], code: string): string {
  if (!code || code === UNSELECTED) return "선택 지역";
  return rows.find((row) => row.regionCode === code)?.addressName ?? "선택 지역";
}

function toFarmmapFieldRow(
  candidate: FarmmapFieldCandidate,
  index: number,
  fetchedAt: string,
  regionLabel: string,
  fallbackClassification: string,
): FieldRow | null {
  if (candidate.lat === null || candidate.lng === null) return null;

  const classification = candidate.landClassification ?? fallbackClassification;
  return {
    id: `farmmap-region-${candidate.pnu ?? `${candidate.lat}-${candidate.lng}`}-${index}`,
    name: candidate.name ?? candidate.address ?? candidate.legalDongAddress ?? candidate.pnu ?? `${regionLabel} 필지 ${index + 1}`,
    address: candidate.address ?? candidate.legalDongAddress ?? regionLabel,
    lat: candidate.lat,
    lng: candidate.lng,
    crop_name: classification,
    growth_stage: null,
    area_m2: candidate.areaM2 ?? 0,
    pnu: candidate.pnu,
    farmmap_meta: {
      source: "farmmap_region_lookup",
      classification,
      legalDongAddress: candidate.legalDongAddress,
      representativePnu: candidate.pnu,
      areaM2: candidate.areaM2,
      raw: candidate.raw,
    },
    risk_level: "unknown",
    risk_score: 0,
    updated_at: fetchedAt,
  };
}

function formatText(value: string | null | undefined): string {
  return value?.trim() ? value : "-";
}

function formatArea(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}㎡`;
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

export default function FieldsMap() {
  const [sidoCode, setSidoCode] = useState(UNSELECTED);
  const [sigunguCode, setSigunguCode] = useState(UNSELECTED);
  const [eupMyeonDongCode, setEupMyeonDongCode] = useState(UNSELECTED);
  const [riCode, setRiCode] = useState(UNSELECTED);
  const [landClassification, setLandClassification] = useState("all");
  const [mapMoveRequestId, setMapMoveRequestId] = useState(0);
  const [mapMoveError, setMapMoveError] = useState<string | null>(null);
  const [isMapMoving, setIsMapMoving] = useState(false);
  const [mapFocusExtent, setMapFocusExtent] = useState<(FarmmapMapExtent & { id: string }) | null>(null);
  const [mapLookupFields, setMapLookupFields] = useState<FieldRow[] | null>(null);
  const [selectedListFieldId, setSelectedListFieldId] = useState<string | null>(null);
  const [listMapFocusTarget, setListMapFocusTarget] = useState<{
    id: string;
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);
  const [selectedCadastralIndex, setSelectedCadastralIndex] = useState(0);

  const {
    data: regionRows = [],
    error: regionError,
    isLoading: isRegionLoading,
  } = useQuery({
    queryKey: ["standard-region-codes", "page-size-1000"],
    queryFn: () => getAllStandardRegionCodes(),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  const sidoOptions = useMemo(
    () => regionRows.filter((row) => standardRegionLevel(row) === "sido"),
    [regionRows],
  );
  const sigunguOptions = useMemo(
    () => childrenOf(regionRows, sidoCode, "sigungu"),
    [regionRows, sidoCode],
  );
  const eupMyeonDongOptions = useMemo(
    () => childrenOf(regionRows, sigunguCode, "eupMyeonDong"),
    [regionRows, sigunguCode],
  );
  const riOptions = useMemo(
    () => childrenOf(regionRows, eupMyeonDongCode, "ri"),
    [regionRows, eupMyeonDongCode],
  );

  const selectedMapRegionCode = riCode !== UNSELECTED
    ? riCode
    : eupMyeonDongCode !== UNSELECTED
      ? eupMyeonDongCode
      : sigunguCode !== UNSELECTED
        ? sigunguCode
        : sidoCode !== UNSELECTED
          ? sidoCode
          : "";
  const selectedLand = LAND_CLASSIFICATION_FILTERS.find((item) => item.value === landClassification)
    ?? LAND_CLASSIFICATION_FILTERS[0];
  const displayFields = mapLookupFields ?? [];
  const resultCount = displayFields.length;
  const canMoveToSelectedFilters = Boolean(selectedMapRegionCode) && !isMapMoving;
  const selectedListField = useMemo(
    () => displayFields.find((field) => field.id === selectedListFieldId) ?? displayFields[0] ?? null,
    [displayFields, selectedListFieldId],
  );
  const selectedFieldDetail = useMemo(
    () => selectedListField ? buildFarmmapFieldDetail(selectedListField) : null,
    [selectedListField],
  );
  const selectedLinkedInfo = selectedFieldDetail?.linkedCadastralInfos[selectedCadastralIndex]
    ?? selectedFieldDetail?.linkedCadastralInfos[0]
    ?? null;

  useEffect(() => {
    setMapLookupFields(null);
    setMapFocusExtent(null);
    setListMapFocusTarget(null);
    setMapMoveError(null);
  }, [selectedLand.value, selectedMapRegionCode]);

  useEffect(() => {
    if (displayFields.length === 0) {
      setSelectedListFieldId(null);
      return;
    }

    if (!selectedListFieldId || !displayFields.some((field) => field.id === selectedListFieldId)) {
      setSelectedListFieldId(displayFields[0].id);
    }
  }, [displayFields, selectedListFieldId]);

  useEffect(() => {
    setSelectedCadastralIndex(0);
  }, [selectedListField?.id]);

  const handleSelectListField = (field: FieldRow) => {
    setSelectedListFieldId(field.id);

    const polygonExtent = getFarmmapPolygonExtent(field);
    if (polygonExtent) {
      setListMapFocusTarget(null);
      setMapFocusExtent({
        ...polygonExtent,
        id: `${field.id}-polygon-${Date.now()}`,
      });
      return;
    }

    setMapFocusExtent(null);

    if (!Number.isFinite(field.lat) || !Number.isFinite(field.lng)) {
      setListMapFocusTarget(null);
      return;
    }

    setListMapFocusTarget({
      id: `${field.id}-${Date.now()}`,
      lat: field.lat,
      lng: field.lng,
      zoom: 17,
    });
  };

  async function handleMoveToSelectedFilters() {
    if (!selectedMapRegionCode) return;

    setMapMoveError(null);
    setIsMapMoving(true);
    setListMapFocusTarget(null);

    try {
      const lookup = await lookupFarmmapRegionMap(selectedMapRegionCode, selectedLand.codes);
      const fields = lookup.candidates
        .map((candidate, index) =>
          toFarmmapFieldRow(candidate, index, lookup.fetchedAt, selectedRegionLabel(regionRows, selectedMapRegionCode), selectedLand.label),
        )
        .filter((field): field is FieldRow => field !== null);

      setMapLookupFields(fields);

      if (!lookup.extent) {
        setMapMoveError("선택 조건의 팜맵 지도 범위를 찾지 못했습니다.");
        setMapFocusExtent(null);
        return;
      }

      setMapFocusExtent({
        ...lookup.extent,
        id: `${selectedMapRegionCode}-${selectedLand.value}-${Date.now()}`,
      });
      setMapMoveRequestId((value) => value + 1);
    } catch (error) {
      setMapMoveError(error instanceof Error ? error.message : "선택 조건의 팜맵 지도 범위를 조회하지 못했습니다.");
    } finally {
      setIsMapMoving(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100svh-6rem)] gap-4 lg:grid-cols-[minmax(260px,326px)_minmax(0,1fr)] lg:items-stretch">
      <Card className="h-fit lg:sticky lg:top-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">필터</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">지역</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={sidoCode}
                onValueChange={(value) => {
                  setSidoCode(value);
                  setSigunguCode(UNSELECTED);
                  setEupMyeonDongCode(UNSELECTED);
                  setRiCode(UNSELECTED);
                }}
                disabled={isRegionLoading}
              >
                <SelectTrigger><SelectValue placeholder="시도" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSELECTED}>시도</SelectItem>
                  {sidoOptions.map((row) => <SelectItem key={row.regionCode} value={row.regionCode}>{row.lowName ?? row.addressName}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select
                value={sigunguCode}
                onValueChange={(value) => {
                  setSigunguCode(value);
                  setEupMyeonDongCode(UNSELECTED);
                  setRiCode(UNSELECTED);
                }}
                disabled={sidoCode === UNSELECTED}
              >
                <SelectTrigger><SelectValue placeholder="시군구" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSELECTED}>시군구</SelectItem>
                  {sigunguOptions.map((row) => <SelectItem key={row.regionCode} value={row.regionCode}>{row.lowName ?? row.addressName}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select
                value={eupMyeonDongCode}
                onValueChange={(value) => {
                  setEupMyeonDongCode(value);
                  setRiCode(UNSELECTED);
                }}
                disabled={sigunguCode === UNSELECTED}
              >
                <SelectTrigger><SelectValue placeholder="읍면동" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSELECTED}>읍면동</SelectItem>
                  {eupMyeonDongOptions.map((row) => <SelectItem key={row.regionCode} value={row.regionCode}>{row.lowName ?? row.addressName}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select
                value={riCode}
                onValueChange={setRiCode}
                disabled={eupMyeonDongCode === UNSELECTED || riOptions.length === 0}
              >
                <SelectTrigger><SelectValue placeholder="리" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSELECTED}>선택</SelectItem>
                  {riOptions.map((row) => <SelectItem key={row.regionCode} value={row.regionCode}>{row.lowName ?? row.addressName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">분류</Label>
            <Select value={landClassification} onValueChange={setLandClassification}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LAND_CLASSIFICATION_FILTERS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={() => void handleMoveToSelectedFilters()}
            disabled={!canMoveToSelectedFilters}
          >
            <MapPin className="mr-2 h-4 w-4" />
            {isMapMoving ? "지도 이동 중" : "선택 조건으로 지도 이동"}
          </Button>

          <div className="text-xs text-muted-foreground">
            검색 결과 {resultCount.toLocaleString()}건
          </div>
          {isMapMoving && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              팜맵 데이터를 조회하는 중입니다.
            </div>
          )}
          {mapLookupFields && resultCount === 0 && !isMapMoving && !mapMoveError && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              선택 지역의 팜맵 필지 목록 데이터가 없습니다. 지도 이동은 팜맵 지도 레이어 범위를 별도로 조회합니다.
            </div>
          )}
          {mapMoveError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {mapMoveError}
            </div>
          )}
          {regionError instanceof Error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              법정동코드 데이터를 불러오지 못했습니다. {regionError.message}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex min-h-[520px] flex-col gap-4 lg:min-h-[calc(100svh-7rem)]">
        <Card className="min-h-[520px] flex-1 overflow-hidden">
          <CardContent className="h-full p-0">
            <FarmmapView
              fields={displayFields}
              className="h-full min-h-[520px] lg:min-h-0"
              showFarmmapBaseLayer
              showFieldPolygons={Boolean(mapLookupFields?.length)}
              farmmapLandCodes={selectedLand.codes}
              farmmapBjdCode={selectedMapRegionCode || null}
              focusTarget={listMapFocusTarget}
              focusExtent={mapFocusExtent}
              focusRequestId={mapMoveRequestId}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader className="border-b pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-primary" />
                필지목록
                <span className="text-sm font-medium text-muted-foreground">({resultCount.toLocaleString()}건)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-[minmax(0,1fr)_64px] border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                <span>주소</span>
                <span className="text-right">분류명</span>
              </div>
              <div className="max-h-[430px] overflow-y-auto p-3">
                {displayFields.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    표시할 필지가 없습니다.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {displayFields.map((field) => {
                      const isSelected = field.id === selectedListField?.id;
                      return (
                        <button
                          key={field.id}
                          type="button"
                          className={cn(
                            "grid w-full grid-cols-[22px_minmax(0,1fr)_56px] items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                            isSelected
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border bg-card hover:bg-muted/50",
                          )}
                          onClick={() => handleSelectListField(field)}
                        >
                          <span
                            className={cn(
                              "grid h-4 w-4 place-items-center rounded-sm border",
                              isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
                            )}
                            aria-hidden="true"
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{field.address ?? field.name}</span>
                            {field.pnu && (
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{field.pnu}</span>
                            )}
                          </span>
                          <span className="truncate text-right text-xs text-muted-foreground">
                            {field.farmmap_meta.classification ?? field.crop_name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-primary" />
                팜맵 정보
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-4">
              {!selectedListField || !selectedFieldDetail ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  좌측 필지목록에서 필지를 선택하세요.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-sm border border-primary/40 bg-primary/5 px-2 py-1 text-xs text-primary">분류</span>
                    <span className="font-semibold">{formatText(selectedFieldDetail.farmmapInfo.classification)}</span>
                    <span className="rounded-sm border border-primary/40 bg-primary/5 px-2 py-1 text-xs text-primary">면적</span>
                    <span className="font-semibold">{formatArea(selectedFieldDetail.farmmapInfo.areaM2)}</span>
                  </div>

                  <div className="grid gap-3 rounded-md border bg-background p-4 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
                    <div className="text-muted-foreground">지적일치율</div>
                    <div className="font-medium">{formatPercent(selectedFieldDetail.farmmapInfo.cadastralMatchRate)}</div>
                    <div className="text-muted-foreground">항공사진</div>
                    <div className="font-medium">{formatText(selectedFieldDetail.farmmapInfo.aerialPhotoYear)}</div>
                    <div className="text-muted-foreground">갱신연도</div>
                    <div className="font-medium">{formatText(selectedFieldDetail.farmmapInfo.updateYear)}</div>
                    <div className="text-muted-foreground">대표주소</div>
                    <div className="font-medium">{formatText(selectedFieldDetail.farmmapInfo.representativeAddress)}</div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="mb-3 flex items-center gap-2 font-semibold">
                      <span className="text-primary">»</span>
                      연계 지적 정보
                    </div>
                    {selectedFieldDetail.linkedCadastralInfos.length > 1 && (
                      <div className="mb-4 flex border-b">
                        {selectedFieldDetail.linkedCadastralInfos.map((_, index) => (
                          <button
                            key={index}
                            type="button"
                            className={cn(
                              "h-10 min-w-14 border border-b-0 px-4 text-sm",
                              index === selectedCadastralIndex
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-muted/30 text-muted-foreground",
                            )}
                            onClick={() => setSelectedCadastralIndex(index)}
                          >
                            {index + 1}
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedLinkedInfo && (
                      <div className="space-y-3">
                        <div className="rounded-md border p-4">
                          <div className="mb-3 font-semibold">{formatText(selectedFieldDetail.farmmapInfo.representativeAddress)}</div>
                          <div className="mb-4 flex flex-wrap gap-3 text-sm">
                            <span><span className="mr-1 rounded-sm border px-1.5 py-0.5 text-xs text-muted-foreground">지목</span>{formatText(selectedLinkedInfo.landCategory)}</span>
                            <span><span className="mr-1 rounded-sm border px-1.5 py-0.5 text-xs text-muted-foreground">면적</span>{formatArea(selectedLinkedInfo.areaM2)}</span>
                          </div>
                          <div className="grid gap-2 text-sm sm:grid-cols-[90px_minmax(0,1fr)]">
                            <div className="text-muted-foreground">소유구분</div>
                            <div className="font-medium">{formatText(selectedLinkedInfo.ownershipType)}</div>
                            <div className="text-muted-foreground">PNU</div>
                            <div className="break-all font-medium">{formatText(selectedLinkedInfo.pnu)}</div>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
