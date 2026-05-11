export type CriticalWeatherIncidentType =
  | "heavy_rain"
  | "strong_wind"
  | "heat_wave"
  | "cold_snap"
  | "disease_pressure";

export type CriticalWeatherIncidentSeverity = "high";

export interface CriticalWeatherIncidentInput {
  collectedAt?: string | null;
  precipitation?: number | null;
  temperature?: number | null;
  wind?: number | null;
  humidity?: number | null;
}

export interface CriticalWeatherIncident {
  type: CriticalWeatherIncidentType;
  severity: CriticalWeatherIncidentSeverity;
  dateKey: string;
  key: string;
  weatherBullets: string[];
  pestRiskBullets: string[];
  irrigationBullets: string[];
  growthManagementBullets: string[];
  actionBullets: string[];
  cautionBullets: string[];
}

const HEAVY_RAIN_MM = 30;
const STRONG_WIND_MS = 14;
const HEAT_WAVE_C = 35;
const COLD_SNAP_C = 0;
const DISEASE_PRESSURE_MIN_HUMIDITY = 90;
const DISEASE_PRESSURE_MIN_RAIN_MM = 10;
const DISEASE_PRESSURE_MIN_TEMP_C = 20;
const DISEASE_PRESSURE_MAX_TEMP_C = 30;

const finiteNumber = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const formatNumber = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/[.]0$/, "");
};

const toKstDateKey = (value: string | null | undefined): string => {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
};

const buildKey = (
  type: CriticalWeatherIncidentType,
  dateKey: string,
  severity: CriticalWeatherIncidentSeverity,
): string => `${type}:${dateKey}:${severity}`;

const incident = (
  type: CriticalWeatherIncidentType,
  dateKey: string,
  details: Omit<CriticalWeatherIncident, "type" | "severity" | "dateKey" | "key">,
): CriticalWeatherIncident => {
  const severity: CriticalWeatherIncidentSeverity = "high";
  return {
    type,
    severity,
    dateKey,
    key: buildKey(type, dateKey, severity),
    ...details,
  };
};

export const detectCriticalWeatherIncident = (
  weather: CriticalWeatherIncidentInput | null | undefined,
): CriticalWeatherIncident | null => {
  if (!weather) return null;

  const dateKey = toKstDateKey(weather.collectedAt);
  const precipitation = finiteNumber(weather.precipitation);
  const temperature = finiteNumber(weather.temperature);
  const wind = finiteNumber(weather.wind);
  const humidity = finiteNumber(weather.humidity);

  if (precipitation !== null && precipitation >= HEAVY_RAIN_MM) {
    const rain = formatNumber(precipitation);
    return incident("heavy_rain", dateKey, {
      weatherBullets: [`특이기상 보정: ${rain}mm 강수로 침수, 낙과, 병해 확산 위험이 높습니다.`],
      pestRiskBullets: [`${rain}mm 강수 이후 잎과 과실의 병반, 곰팡이, 해충 피해 흔적을 우선 확인합니다.`],
      irrigationBullets: [`${rain}mm 강수 조건에서는 추가 관수보다 배수와 토양 물 고임 확인을 우선합니다.`],
      growthManagementBullets: ["강수 뒤 지주, 유인끈, 착과 부위, 배수로 상태를 함께 점검합니다."],
      actionBullets: [`${rain}mm 강수 이후 배수로 막힘, 물 고임, 지주/유인 상태를 즉시 확인합니다.`],
      cautionBullets: ["젖은 포장에서는 무리한 진입과 임의 방제 판단을 피하고 원문 PDF 및 현장 상태를 함께 확인합니다."],
    });
  }

  if (wind !== null && wind >= STRONG_WIND_MS) {
    const windSpeed = formatNumber(wind);
    return incident("strong_wind", dateKey, {
      weatherBullets: [`특이기상 보정: 풍속 ${windSpeed}m/s로 쓰러짐, 낙과, 시설물 손상 위험이 높습니다.`],
      pestRiskBullets: [],
      irrigationBullets: [],
      growthManagementBullets: ["강풍 뒤 줄기, 유인끈, 지주, 과실 손상 여부를 우선 점검합니다."],
      actionBullets: [`풍속 ${windSpeed}m/s 이후 지주, 유인끈, 방풍망, 시설물 고정 상태를 확인합니다.`],
      cautionBullets: ["강풍 중 시설 보수 작업은 피하고 안전 확보 후 현장을 확인합니다."],
    });
  }

  if (temperature !== null && temperature >= HEAT_WAVE_C) {
    const temp = formatNumber(temperature);
    return incident("heat_wave", dateKey, {
      weatherBullets: [`특이기상 보정: 기온 ${temp}℃로 고온 스트레스와 수분 부족 위험이 높습니다.`],
      pestRiskBullets: [],
      irrigationBullets: [`기온 ${temp}℃ 조건에서는 토양 수분과 잎 처짐을 확인해 관수 필요성을 판단합니다.`],
      growthManagementBullets: ["고온 뒤 잎마름, 일소, 생육 정지 징후를 우선 확인합니다."],
      actionBullets: [`기온 ${temp}℃ 이후 토양 수분, 잎 처짐, 과실 일소 흔적을 확인합니다.`],
      cautionBullets: ["한낮 고온 시간대의 무리한 작업은 피합니다."],
    });
  }

  if (temperature !== null && temperature <= COLD_SNAP_C) {
    const temp = formatNumber(temperature);
    return incident("cold_snap", dateKey, {
      weatherBullets: [`특이기상 보정: 기온 ${temp}℃로 냉해 위험이 높습니다.`],
      pestRiskBullets: [],
      irrigationBullets: [],
      growthManagementBullets: ["저온 뒤 새순, 꽃, 어린 과실의 갈변과 생육 정지 여부를 확인합니다."],
      actionBullets: [`기온 ${temp}℃ 이후 새순, 꽃, 어린 과실의 냉해 흔적을 확인합니다.`],
      cautionBullets: ["피해 확정 전 임의 처방보다 관찰 기록과 공식 자료 확인을 우선합니다."],
    });
  }

  if (
    precipitation !== null &&
    humidity !== null &&
    temperature !== null &&
    precipitation >= DISEASE_PRESSURE_MIN_RAIN_MM &&
    humidity >= DISEASE_PRESSURE_MIN_HUMIDITY &&
    temperature >= DISEASE_PRESSURE_MIN_TEMP_C &&
    temperature <= DISEASE_PRESSURE_MAX_TEMP_C
  ) {
    const rain = formatNumber(precipitation);
    const temp = formatNumber(temperature);
    const humidityText = formatNumber(humidity);
    return incident("disease_pressure", dateKey, {
      weatherBullets: [
        `특이기상 보정: ${rain}mm 강수, ${temp}℃, 습도 ${humidityText}% 조합으로 병해 확인 우선순위가 높습니다.`,
      ],
      pestRiskBullets: ["고습과 강수 뒤 잎, 줄기, 과실의 병반과 곰팡이 징후를 우선 확인합니다."],
      irrigationBullets: ["고습 조건에서는 추가 관수보다 통풍과 토양 수분 상태 확인을 우선합니다."],
      growthManagementBullets: ["통풍 불량 구역과 습기가 오래 남는 구역을 먼저 확인합니다."],
      actionBullets: [`${rain}mm 강수와 습도 ${humidityText}% 이후 병반, 곰팡이, 통풍 상태를 확인합니다.`],
      cautionBullets: ["기상 조건만으로 병해 발생을 확정하지 말고 현장 징후와 공식 자료를 함께 확인합니다."],
    });
  }

  return null;
};
