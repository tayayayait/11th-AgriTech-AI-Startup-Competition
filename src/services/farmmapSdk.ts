import { fetchFarmmapSdkScript } from "@/services/farmmapClient";

const FARM_MAP_PUBLIC_ASSET_BASE_URL = "https://agis.epis.or.kr/ASD";
const FARMMAP_SDK_SCRIPT_ID = "fieldguard-farmmap-sdk";

export interface FarmmapMarkerOptions {
  id: string;
  iconSizeWidth: number;
  iconSizeHeight: number;
  iconUrl: string;
  x: number;
  y: number;
  epsg: "EPSG:4326";
  opacity: number;
  clickFunc?: () => void;
  data: Record<string, string | number | null>;
}

export interface FarmmapVectorPoint {
  x: number;
  y: number;
}

export interface FarmmapVectorStyle {
  fillColor?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  strokeColor?: string;
  strokeLinecap?: string;
  fontSize?: string;
  fontColor?: string;
  fontWeight?: string;
  label?: string;
  labelOutlineColor?: string;
  labelOutlineWidth?: number;
}

export interface FarmmapVectorOptions {
  id: string;
  type: "polygon";
  xy: FarmmapVectorPoint[];
  epsg?: string;
  style?: FarmmapVectorStyle;
  data?: Record<string, string | number | null>;
  attributes?: Record<string, string | number | null>;
}

export interface FarmmapVectorLayerOptions {
  defaultStyle?: FarmmapVectorStyle;
  selectStyle?: FarmmapVectorStyle;
  hover?: boolean;
  multiple?: boolean;
  toggle?: boolean;
  onSelect?: (feature: unknown) => void;
  onUnselect?: (feature: unknown) => void;
}

export interface FarmmapWmsLayerOptions {
  layers: string;
  styles: string;
  [key: string]: string | number | boolean | undefined;
}

export interface FarmmapMap {
  destroy?: () => void;
  events?: { triggerEvent?: (eventName: string) => void };
  getProjectionObject?: () => unknown;
  getLonLatFromPixel?: (xy: unknown) => { lon: number; lat: number; transform: (source: unknown, target: unknown) => { lon: number; lat: number } };
  setCenter?: (lonLat: unknown, zoom?: number) => void;
  updateSize?: () => void;
  zoomToExtent?: (bounds: unknown) => void;
}

export interface FarmmapObj {
  rootUri?: string;
  serverUrl?: string;
  init: (mapDivId: string) => FarmmapMap;
  getObject?: (kind: string, name: string, map: FarmmapMap) => unknown;
  addFarmmapLayer: (layerName: string, map: FarmmapMap) => void;
  addMarkerLayer: (layerName: string, map: FarmmapMap) => void;
  addMarker: (layerName: string, options: FarmmapMarkerOptions, map: FarmmapMap) => void;
  addWMSLayer?: (layerName: string, wmsUrl: string, options: FarmmapWmsLayerOptions, map: FarmmapMap) => void;
  addVectorLayer?: (layerName: string, options: FarmmapVectorLayerOptions, map: FarmmapMap) => void;
  addVector?: (layerName: string, options: FarmmapVectorOptions, map: FarmmapMap) => void;
  addEvent?: (eventName: string, map: FarmmapMap, callback: (event: { xy?: unknown; type?: string }) => void) => void;
  removeEvent?: (eventName: string, map: FarmmapMap) => void;
  removeLayer?: (layerName: string, map: FarmmapMap) => void;
}

declare global {
  interface Window {
    farmmapObj?: FarmmapObj;
    OpenLayers?: {
      Bounds: new (left?: number, bottom?: number, right?: number, top?: number) => { extend: (lonLat: unknown) => void };
      LonLat: new (lon: number, lat: number) => { transform: (source: unknown, target: unknown) => unknown };
      Projection: new (projection: string) => unknown;
    };
  }
}

const scriptPromises = new Map<string, Promise<void>>();
let farmmapSdkScriptPromise: Promise<void> | null = null;

export function getFarmmapExternalScriptUrls(): string[] {
  return [
    `${FARM_MAP_PUBLIC_ASSET_BASE_URL}/pub2/js/jquery-3.4.1.js`,
    `${FARM_MAP_PUBLIC_ASSET_BASE_URL}/js/lib/openlayers/OpenLayers.js`,
    `${FARM_MAP_PUBLIC_ASSET_BASE_URL}/js/lib/proj4js/proj4.js`,
  ];
}

export function getFarmmapSdkProxyRequest(): { operation: "sdkScript" } {
  return { operation: "sdkScript" };
}

function appendScript(src: string): Promise<void> {
  if (scriptPromises.has(src)) return scriptPromises.get(src)!;

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing?.dataset.loaded === "true") return Promise.resolve();

  const promise = new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.farmmapLoader = "true";
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load Farmmap script: ${src}`));
    if (!existing) document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  return promise;
}

function extractFarmmapSdkScript(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && typeof (data as { raw?: unknown }).raw === "string") {
    return (data as { raw: string }).raw;
  }
  throw new Error("Farmmap SDK proxy returned an invalid script payload.");
}

async function appendFarmmapSdkScript(): Promise<void> {
  if (farmmapSdkScriptPromise) return farmmapSdkScriptPromise;
  if (window.farmmapObj) return;

  farmmapSdkScriptPromise = (async () => {
    const existing = document.getElementById(FARMMAP_SDK_SCRIPT_ID);
    if (existing) return;

    const response = await fetchFarmmapSdkScript();
    const scriptText = extractFarmmapSdkScript(response.data);
    const script = document.createElement("script");
    script.id = FARMMAP_SDK_SCRIPT_ID;
    script.dataset.farmmapLoader = "true";
    script.text = scriptText;
    document.head.appendChild(script);
  })();

  return farmmapSdkScriptPromise;
}

export async function loadFarmmapSdk(): Promise<FarmmapObj> {
  if (window.farmmapObj && window.OpenLayers) return window.farmmapObj;

  for (const src of getFarmmapExternalScriptUrls()) {
    await appendScript(src);
  }
  await appendFarmmapSdkScript();

  if (!window.farmmapObj || !window.OpenLayers) {
    throw new Error("Farmmap SDK did not expose farmmapObj/OpenLayers.");
  }

  return window.farmmapObj;
}
