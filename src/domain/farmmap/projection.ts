export interface FarmmapPlanarPoint {
  x: number;
  y: number;
}

export interface Wgs84Point {
  lat: number;
  lng: number;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const GRS80_A = 6378137;
const GRS80_F = 1 / 298.257222101;
const EPSG5179_K0 = 0.9996;
const EPSG5179_LAT0 = 38 * DEG_TO_RAD;
const EPSG5179_LON0 = 127.5 * DEG_TO_RAD;
const EPSG5179_FALSE_EASTING = 1_000_000;
const EPSG5179_FALSE_NORTHING = 2_000_000;

const GRS80_E2 = 2 * GRS80_F - GRS80_F ** 2;
const GRS80_EP2 = GRS80_E2 / (1 - GRS80_E2);

function meridionalArc(latRad: number): number {
  const e4 = GRS80_E2 ** 2;
  const e6 = GRS80_E2 ** 3;

  return GRS80_A * (
    (1 - GRS80_E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * latRad
    - (3 * GRS80_E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * latRad)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * latRad)
    - (35 * e6 / 3072) * Math.sin(6 * latRad)
  );
}

export function epsg5179ToWgs84(point: FarmmapPlanarPoint): Wgs84Point {
  const x = point.x - EPSG5179_FALSE_EASTING;
  const y = point.y - EPSG5179_FALSE_NORTHING;
  const m0 = meridionalArc(EPSG5179_LAT0);
  const m = m0 + y / EPSG5179_K0;
  const mu = m / (GRS80_A * (1 - GRS80_E2 / 4 - 3 * GRS80_E2 ** 2 / 64 - 5 * GRS80_E2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - GRS80_E2)) / (1 + Math.sqrt(1 - GRS80_E2));

  const fp = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);

  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);
  const c1 = GRS80_EP2 * cosFp ** 2;
  const t1 = tanFp ** 2;
  const n1 = GRS80_A / Math.sqrt(1 - GRS80_E2 * sinFp ** 2);
  const r1 = GRS80_A * (1 - GRS80_E2) / (1 - GRS80_E2 * sinFp ** 2) ** 1.5;
  const d = x / (n1 * EPSG5179_K0);

  const latRad = fp - (n1 * tanFp / r1) * (
    d ** 2 / 2
    - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * GRS80_EP2) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * GRS80_EP2 - 3 * c1 ** 2) * d ** 6 / 720
  );

  const lngRad = EPSG5179_LON0 + (
    d
    - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * GRS80_EP2 + 24 * t1 ** 2) * d ** 5 / 120
  ) / cosFp;

  return {
    lat: latRad * RAD_TO_DEG,
    lng: lngRad * RAD_TO_DEG,
  };
}

function toPlanarPoint(value: unknown): FarmmapPlanarPoint | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const x = Number(source.x);
  const y = Number(source.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function polygonCentroid(points: FarmmapPlanarPoint[]): FarmmapPlanarPoint | null {
  if (points.length === 0) return null;

  let doubledArea = 0;
  let sumX = 0;
  let sumY = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    doubledArea += cross;
    sumX += (current.x + next.x) * cross;
    sumY += (current.y + next.y) * cross;
  }

  if (Math.abs(doubledArea) < 0.000001) {
    const total = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
    return { x: total.x / points.length, y: total.y / points.length };
  }

  return {
    x: sumX / (3 * doubledArea),
    y: sumY / (3 * doubledArea),
  };
}

export function centroidFromFarmmapGeometry(value: unknown): FarmmapPlanarPoint | null {
  if (!Array.isArray(value)) return null;

  const centroids = value
    .map((geometry) => {
      if (!geometry || typeof geometry !== "object") return null;
      const xy = (geometry as Record<string, unknown>).xy;
      if (!Array.isArray(xy)) return null;
      const points = xy.map(toPlanarPoint).filter((point): point is FarmmapPlanarPoint => point !== null);
      return polygonCentroid(points);
    })
    .filter((point): point is FarmmapPlanarPoint => point !== null);

  if (centroids.length === 0) return null;
  const total = centroids.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / centroids.length, y: total.y / centroids.length };
}

