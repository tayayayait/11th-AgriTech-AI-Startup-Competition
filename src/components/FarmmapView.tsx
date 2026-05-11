import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, MapPin } from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import type { FarmmapMapExtent } from "@/domain/farmmap/types";
import type { FieldRow } from "@/domain/fields/types";
import {
  FARMMAP_BASE_LAYER_NAME,
  FARMMAP_FIELD_POLYGON_LAYER_NAME,
  FARMMAP_MARKER_LAYER_NAME,
  FARMMAP_WMS_LAYER_ID,
  FARMMAP_WMS_STYLE_ID,
  buildFarmmapClassificationCqlFilter,
  buildFarmmapPolygonOptions,
  buildFarmmapMarkerOptions,
  hasValidFarmmapCoordinate,
} from "@/domain/farmmap/map";
import { cn } from "@/lib/utils";
import { loadFarmmapSdk, type FarmmapMap, type FarmmapObj, type FarmmapVectorOptions } from "@/services/farmmapSdk";

type LoadState = "idle" | "loading" | "ready" | "error";

interface FarmmapViewProps {
  fields: FieldRow[];
  className?: string;
  onMapClick?: (point: { lat: number; lng: number }) => void;
  showStatusOverlay?: boolean;
  showFarmmapBaseLayer?: boolean;
  showFieldPolygons?: boolean;
  farmmapLandCodes?: string[] | null;
  farmmapBjdCode?: string | null;
  focusTarget?: { id?: string; lat: number; lng: number; zoom?: number } | null;
  focusExtent?: (FarmmapMapExtent & { id?: string }) | null;
  focusRequestId?: number;
}

function getMarkerIconUrl(farmmapObj: FarmmapObj): string {
  const rootUri = farmmapObj.rootUri ?? "https://agis.epis.or.kr/ASD/";
  return `${rootUri.replace(/\/?$/, "/")}images/marker/marker3.png`;
}

function getFarmmapWmsUrl(farmmapObj: FarmmapObj): string {
  const serverUrl = farmmapObj.serverUrl ?? "https://agis.epis.or.kr/geoserver/";
  return `${serverUrl.replace(/\/?$/, "/")}farmmap/wms?`;
}

function toMapLonLat(map: FarmmapMap, lng: number, lat: number): unknown | null {
  const OpenLayers = window.OpenLayers;
  if (!OpenLayers) return null;

  const source = new OpenLayers.Projection("EPSG:4326");
  const target = map.getProjectionObject?.() ?? new OpenLayers.Projection("EPSG:5179");
  return new OpenLayers.LonLat(lng, lat).transform(source, target);
}

function toWgs84FromMapPixel(map: FarmmapMap, xy: unknown): { lat: number; lng: number } | null {
  const OpenLayers = window.OpenLayers;
  if (!OpenLayers || !xy || !map.getLonLatFromPixel) return null;

  const source = map.getProjectionObject?.() ?? new OpenLayers.Projection("EPSG:5179");
  const target = new OpenLayers.Projection("EPSG:4326");
  const lonLat = map.getLonLatFromPixel(xy).transform(source, target);
  const lat = Number(lonLat.lat);
  const lng = Number(lonLat.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 33 || lat > 39.5 || lng < 124 || lng > 132) return null;
  return { lat, lng };
}

function focusMapOnFields(map: FarmmapMap, fields: FieldRow[]): void {
  const OpenLayers = window.OpenLayers;
  if (!OpenLayers || fields.length === 0) return;

  try {
    if (fields.length === 1) {
      const field = fields[0];
      const lonLat = toMapLonLat(map, field.lng, field.lat);
      if (lonLat && map.setCenter) map.setCenter(lonLat, 15);
      return;
    }

    const bounds = new OpenLayers.Bounds();
    for (const field of fields) {
      const lonLat = toMapLonLat(map, field.lng, field.lat);
      if (lonLat) bounds.extend(lonLat);
    }
    map.zoomToExtent?.(bounds);
  } catch (error) {
    console.warn("[farmmap] failed to focus map", error);
  }
}

function focusMapOnPoint(
  map: FarmmapMap,
  point: { lat: number; lng: number; zoom?: number },
): void {
  if (!hasValidFarmmapCoordinate(point)) return;

  try {
    const lonLat = toMapLonLat(map, point.lng, point.lat);
    if (lonLat && map.setCenter) map.setCenter(lonLat, point.zoom ?? 15);
  } catch (error) {
    console.warn("[farmmap] failed to focus map point", error);
  }
}

function focusMapOnExtent(map: FarmmapMap, extent: FarmmapMapExtent): void {
  const OpenLayers = window.OpenLayers;
  if (!OpenLayers) return;

  try {
    const bounds = new OpenLayers.Bounds(extent.minX, extent.minY, extent.maxX, extent.maxY);
    map.zoomToExtent?.(bounds);
  } catch (error) {
    console.warn("[farmmap] failed to focus map extent", error);
  }
}

export function FarmmapView({
  fields,
  className,
  onMapClick,
  showStatusOverlay = true,
  showFarmmapBaseLayer = true,
  showFieldPolygons = false,
  farmmapLandCodes = null,
  farmmapBjdCode = null,
  focusTarget = null,
  focusExtent = null,
  focusRequestId = 0,
}: FarmmapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapDivIdRef = useRef(`farmmap-${Math.random().toString(36).slice(2)}`);
  const mapRef = useRef<FarmmapMap | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<FieldRow | null>(null);

  const fieldsWithCoords = useMemo(
    () => fields.filter(hasValidFarmmapCoordinate),
    [fields],
  );
  const fieldPolygons = useMemo(
    () =>
      showFieldPolygons
        ? fields
          .map(buildFarmmapPolygonOptions)
          .filter((polygon): polygon is FarmmapVectorOptions => polygon !== null)
        : [],
    [fields, showFieldPolygons],
  );
  const farmmapLandCodeKey = farmmapLandCodes?.join(",") ?? "";

  useEffect(() => {
    let cancelled = false;

    async function initializeMap() {
      setLoadState("loading");
      setErrorMessage(null);

      try {
        const farmmapObj = await loadFarmmapSdk();
        if (cancelled) return;

        const map = farmmapObj.init(mapDivIdRef.current);
        mapRef.current = map;

        setLoadState("ready");
      } catch (error) {
        if (cancelled) return;
        setLoadState("error");
        setErrorMessage(error instanceof Error ? error.message : "팜맵 지도를 초기화하지 못했습니다.");
      }
    }

    initializeMap();

    return () => {
      cancelled = true;
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const farmmapObj = window.farmmapObj;
    if (loadState !== "ready" || !map || !farmmapObj) return;

    try {
      const currentLayer = farmmapObj.getObject?.("layer", FARMMAP_BASE_LAYER_NAME, map);
      if (currentLayer) farmmapObj.removeLayer?.(FARMMAP_BASE_LAYER_NAME, map);

      if (showFarmmapBaseLayer) {
        const cqlFilter = buildFarmmapClassificationCqlFilter(farmmapLandCodes, farmmapBjdCode);
        if (cqlFilter && farmmapObj.addWMSLayer) {
          farmmapObj.addWMSLayer(
            FARMMAP_BASE_LAYER_NAME,
            getFarmmapWmsUrl(farmmapObj),
            {
              version: "1.1.1",
              layers: FARMMAP_WMS_LAYER_ID,
              styles: FARMMAP_WMS_STYLE_ID,
              CQL_FILTER: cqlFilter,
            },
            map,
          );
        } else {
          farmmapObj.addFarmmapLayer(FARMMAP_BASE_LAYER_NAME, map);
        }
        return;
      }
    } catch (error) {
      console.warn("[farmmap] failed to update base layer", error);
    }
  }, [farmmapBjdCode, farmmapLandCodeKey, farmmapLandCodes, loadState, showFarmmapBaseLayer]);

  useEffect(() => {
    const map = mapRef.current;
    const farmmapObj = window.farmmapObj;
    if (loadState !== "ready" || !map || !farmmapObj) return;

    try {
      const currentLayer = farmmapObj.getObject?.("layer", FARMMAP_FIELD_POLYGON_LAYER_NAME, map);
      if (currentLayer) farmmapObj.removeLayer?.(FARMMAP_FIELD_POLYGON_LAYER_NAME, map);

      if (!showFieldPolygons || fieldPolygons.length === 0) return;
      if (!farmmapObj.addVectorLayer || !farmmapObj.addVector) return;

      farmmapObj.addVectorLayer(
        FARMMAP_FIELD_POLYGON_LAYER_NAME,
        {
          hover: false,
          multiple: false,
          toggle: true,
        },
        map,
      );

      for (const polygon of fieldPolygons) {
        farmmapObj.addVector(FARMMAP_FIELD_POLYGON_LAYER_NAME, polygon, map);
      }
    } catch (error) {
      console.warn("[farmmap] failed to update field polygons", error);
    }
  }, [fieldPolygons, loadState, showFieldPolygons]);

  useEffect(() => {
    const map = mapRef.current;
    const farmmapObj = window.farmmapObj;
    if (loadState !== "ready" || !map || !farmmapObj) return;

    try {
      const currentLayer = farmmapObj.getObject?.("layer", FARMMAP_MARKER_LAYER_NAME, map);
      if (currentLayer) farmmapObj.removeLayer?.(FARMMAP_MARKER_LAYER_NAME, map);

      if (fieldsWithCoords.length === 0) return;

      farmmapObj.addMarkerLayer(FARMMAP_MARKER_LAYER_NAME, map);
      const iconUrl = getMarkerIconUrl(farmmapObj);

      for (const field of fieldsWithCoords) {
        farmmapObj.addMarker(
          FARMMAP_MARKER_LAYER_NAME,
          buildFarmmapMarkerOptions(field, iconUrl, () => setSelectedField(field)),
          map,
        );
      }

      focusMapOnFields(map, fieldsWithCoords);
    } catch (error) {
      console.warn("[farmmap] failed to update field markers", error);
      setErrorMessage("필지 마커를 지도에 표시하지 못했습니다.");
    }
  }, [fieldsWithCoords, loadState]);

  useEffect(() => {
    const map = mapRef.current;
    if (loadState !== "ready" || !map || !focusTarget) return;
    focusMapOnPoint(map, focusTarget);
  }, [focusTarget, loadState]);

  useEffect(() => {
    const map = mapRef.current;
    if (loadState !== "ready" || !map || !focusExtent) return;
    focusMapOnExtent(map, focusExtent);
  }, [focusExtent, loadState]);

  useEffect(() => {
    const map = mapRef.current;
    if (loadState !== "ready" || !map || focusRequestId <= 0) return;
    if (focusExtent) {
      focusMapOnExtent(map, focusExtent);
      return;
    }
    if (focusTarget) {
      focusMapOnPoint(map, focusTarget);
      return;
    }
    focusMapOnFields(map, fieldsWithCoords);
  }, [fieldsWithCoords, focusExtent, focusRequestId, focusTarget, loadState]);

  useEffect(() => {
    const map = mapRef.current;
    const farmmapObj = window.farmmapObj;
    if (loadState !== "ready" || !map || !farmmapObj?.addEvent || !onMapClick) return;

    const handleClick = (event: { xy?: unknown }) => {
      const point = toWgs84FromMapPixel(map, event.xy);
      if (point) onMapClick(point);
    };

    farmmapObj.addEvent("click", map, handleClick);
    return () => {
      try {
        farmmapObj.removeEvent?.("click", map);
      } catch (error) {
        console.warn("[farmmap] failed to remove click event", error);
      }
    };
  }, [loadState, onMapClick]);

  useEffect(() => {
    const container = containerRef.current;
    if (loadState !== "ready" || !container) return;

    const refreshMapSize = () => {
      const map = mapRef.current;
      map?.updateSize?.();
      map?.events?.triggerEvent?.("updatesize");
    };

    refreshMapSize();

    const observer = new ResizeObserver(refreshMapSize);
    observer.observe(container);
    window.addEventListener("resize", refreshMapSize, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refreshMapSize);
    };
  }, [loadState]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-[360px] w-full overflow-hidden rounded-md bg-surface-muted",
        className,
      )}
      data-testid="farmmap-view"
    >
      <div id={mapDivIdRef.current} className="h-full w-full" data-testid="farmmap-canvas" />

      {showStatusOverlay && (
        <div className="absolute left-3 top-3 rounded-md border bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
          <div className="flex items-center gap-2 font-medium">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            팜맵 Open API
          </div>
          <div className="mt-1 text-muted-foreground">
            필지 {fieldsWithCoords.length.toLocaleString()}건 표시
          </div>
        </div>
      )}

      {loadState === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-background/70 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            팜맵 지도를 불러오는 중
          </div>
        </div>
      )}

      {loadState === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-background/80 p-6 text-center text-sm">
          <div className="max-w-md rounded-md border bg-background p-4 shadow-sm">
            <AlertCircle className="mx-auto mb-2 h-5 w-5 text-destructive" />
            <div className="font-medium">팜맵 지도 로딩 실패</div>
            <div className="mt-2 text-xs text-muted-foreground">{errorMessage}</div>
          </div>
        </div>
      )}

      {showStatusOverlay && loadState === "ready" && fieldsWithCoords.length === 0 && (
        <div className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-md border bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
          표시할 유효 좌표가 없습니다.
        </div>
      )}

      {selectedField && (
        <div className="absolute bottom-3 left-3 w-72 rounded-md border bg-background/95 p-3 text-sm shadow-sm backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">{selectedField.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{selectedField.address}</div>
            </div>
            <RiskBadge level={selectedField.risk_level} size="sm" />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {selectedField.crop_name} · 위험도 {selectedField.risk_score} / 100
          </div>
        </div>
      )}
    </div>
  );
}
