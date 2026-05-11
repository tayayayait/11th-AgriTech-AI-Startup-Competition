import type { StandardRegionCodeRow } from "@/domain/standardRegion/types";
import { standardRegionLevel } from "@/domain/standardRegion/standardRegion";

export interface LegalRegionLotInput {
  regionCode: string;
  mainLot: string;
  subLot?: string;
  isMountain?: boolean;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeLotNumber(value: string, allowZero: boolean): string | null {
  const digits = digitsOnly(value);
  if (!digits) return allowZero ? "0000" : null;

  const parsed = Number(digits);
  if (!Number.isInteger(parsed) || parsed > 9999) return null;
  if (!allowZero && parsed <= 0) return null;

  return String(parsed).padStart(4, "0");
}

export function normalizeLotInput(value: string): string {
  return digitsOnly(value).slice(0, 4);
}

export function isParcelSearchableRegion(row: StandardRegionCodeRow): boolean {
  const level = standardRegionLevel(row);
  return level === "eupMyeonDong" || level === "ri";
}

export function buildPnuFromLegalRegionLot(input: LegalRegionLotInput): string | null {
  if (!/^\d{10}$/.test(input.regionCode)) return null;

  const main = normalizeLotNumber(input.mainLot, false);
  const sub = normalizeLotNumber(input.subLot ?? "", true);
  if (!main || !sub) return null;

  return `${input.regionCode}${input.isMountain ? "2" : "1"}${main}${sub}`;
}

export function formatLegalRegionLotAddress(
  addressName: string,
  mainLot: string,
  subLot?: string,
  isMountain = false,
): string {
  const main = normalizeLotNumber(mainLot, false);
  const sub = normalizeLotNumber(subLot ?? "", true);
  if (!main || !sub) return addressName;

  const mainText = String(Number(main));
  const subNumber = Number(sub);
  const lotText = subNumber > 0 ? `${mainText}-${subNumber}` : mainText;
  return `${addressName} ${isMountain ? "산 " : ""}${lotText}`;
}
