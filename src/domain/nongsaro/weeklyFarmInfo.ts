export interface WeeklyFarmInfoPeriod {
  periodStart: string;
  periodEnd: string;
}

const DATE_RANGE_PATTERN =
  /(\d{4})\s*[.]\s*(\d{1,2})\s*[.]\s*(\d{1,2})\s*\.?\s*~\s*(?:(\d{4})\s*[.]\s*)?(?:(\d{1,2})\s*[.]\s*)?(\d{1,2})\s*\.?/;

const padDatePart = (value: number): string => String(value).padStart(2, "0");

const isValidDate = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const toDateKey = (year: number, month: number, day: number): string | null => {
  if (!isValidDate(year, month, day)) return null;
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
};

const toNumber = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseWeeklyFarmInfoPeriod = (subject: string): WeeklyFarmInfoPeriod | null => {
  const match = subject.match(DATE_RANGE_PATTERN);
  if (!match) return null;

  const startYear = toNumber(match[1]);
  const startMonth = toNumber(match[2]);
  const startDay = toNumber(match[3]);
  const endYear = toNumber(match[4]) ?? startYear;
  const endMonth = toNumber(match[5]) ?? startMonth;
  const endDay = toNumber(match[6]);
  if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) return null;

  const periodStart = toDateKey(startYear, startMonth, startDay);
  const periodEnd = toDateKey(endYear, endMonth, endDay);
  if (!periodStart || !periodEnd) return null;

  return { periodStart, periodEnd };
};

export const getKstDateKey = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return date.toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
};

export const isDateWithinWeeklyFarmInfoPeriod = (
  dateKey: string,
  period: WeeklyFarmInfoPeriod | null,
): boolean => {
  if (!period) return false;
  return period.periodStart <= dateKey && dateKey <= period.periodEnd;
};
