import { readFileSync } from "node:fs";

function loadLocalEnv(path = ".env") {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 0) continue;

    const name = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;

    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[name] = value;
  }
}

loadLocalEnv();

const DEFAULTS = {
  NONGSARO_BASE_URL: "http://api.nongsaro.go.kr/service",
  KMA_BASE_URL: "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0",
  STANDARD_REGION_BASE_URL: "http://apis.data.go.kr/1741000/StanReginCd",
  FARMMAP_BASE_URL: "https://agis.epis.or.kr/ASD",
  FARMMAP_DOMAIN: "http://10.98.195.97:8080/",
  GEMINI_BASE_URL: "https://generativelanguage.googleapis.com",
  GEMINI_MODEL: "gemini-3-flash-preview",
  NCPMS_BASE_URL: "http://ncpms.rda.go.kr/npmsAPI/service",
  PSIS_BASE_URL: "https://psis.rda.go.kr/openApi/service.do",
};

const KMA_ENDPOINTS = {
  ultraSrtNcst: "getUltraSrtNcst",
  vilageFcst: "getVilageFcst",
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const VILAGE_FCST_BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];

const results = [];

function env(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`missing env: ${name}`);
  return value;
}

function optionalEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function baseUrl(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildUrl(base, path, params) {
  const url = new URL(path, baseUrl(base));
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchText(label, url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    let message = "";
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.error?.message === "string") {
        message = `: ${parsed.error.message}`;
      }
    } catch {
      message = "";
    }
    throw new Error(`${label} upstream status ${response.status}${message}`);
  }
  assert(text.trim().length > 0, `${label} returned an empty body`);
  return text;
}

async function fetchJson(label, url, init) {
  const text = await fetchText(label, url, init);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON body`);
  }
}

function xmlText(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
  if (!match) return "";
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function xmlItems(xml) {
  return Array.from(xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)).map((match) => {
    const item = {};
    for (const field of match[1].matchAll(/<([A-Za-z0-9_]+)[^>]*>([\s\S]*?)<\/\1>/g)) {
      item[field[1]] = field[2]
        .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1")
        .replace(/<[^>]+>/g, "")
        .trim();
    }
    return item;
  });
}

function parseNongsaroXml(label, xml) {
  const resultCode = xmlText(xml, "resultCode") || "00";
  const resultMsg = xmlText(xml, "resultMsg");
  if (resultCode !== "00") {
    throw new Error(`${label} resultCode ${resultCode}${resultMsg ? ` (${resultMsg})` : ""}`);
  }
  return xmlItems(xml);
}

async function nongsaro(serviceName, operationName, params = {}) {
  const url = buildUrl(env("NONGSARO_BASE_URL", DEFAULTS.NONGSARO_BASE_URL), `${serviceName}/${operationName}`, {
    apiKey: env("NONGSARO_API_KEY"),
    ...params,
  });
  const xml = await fetchText(`Nongsaro ${serviceName}/${operationName}`, url, {
    headers: { Accept: "text/xml, application/xml, */*" },
  });
  return parseNongsaroXml(`Nongsaro ${serviceName}/${operationName}`, xml);
}

function latestYear(items) {
  const years = items
    .map((item) => Number(item.yearCode || item.yearVal || item.sYear || item.year || ""))
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  return years.length ? String(Math.trunc(years[0])) : String(new Date().getFullYear());
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatBaseDateTime(date) {
  return {
    base_date: `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`,
    base_time: `${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}`,
  };
}

function toPseudoKstDate(date) {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

function resolveUltraSrtNcst(now = new Date()) {
  const nowKst = toPseudoKstDate(now);
  const currentHour = new Date(nowKst);
  currentHour.setUTCMinutes(0, 0, 0);
  const availableAt = new Date(currentHour.getTime() + TEN_MINUTES_MS);
  const base = nowKst >= availableAt ? currentHour : new Date(currentHour.getTime() - ONE_HOUR_MS);
  return formatBaseDateTime(base);
}

function resolveVilageFcst(now = new Date()) {
  const nowKst = toPseudoKstDate(now);
  for (let index = VILAGE_FCST_BASE_HOURS.length - 1; index >= 0; index -= 1) {
    const base = new Date(nowKst);
    base.setUTCHours(VILAGE_FCST_BASE_HOURS[index], 0, 0, 0);
    const availableAt = new Date(base.getTime() + TEN_MINUTES_MS);
    if (nowKst >= availableAt) return formatBaseDateTime(base);
  }
  const previousDay = new Date(nowKst);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  previousDay.setUTCHours(23, 0, 0, 0);
  return formatBaseDateTime(previousDay);
}

async function kma(endpoint, baseDateTime) {
  const url = buildUrl(env("KMA_BASE_URL", DEFAULTS.KMA_BASE_URL), KMA_ENDPOINTS[endpoint], {
    serviceKey: env("KMA_SERVICE_KEY"),
    pageNo: 1,
    numOfRows: 1000,
    dataType: "JSON",
    ...baseDateTime,
    nx: 60,
    ny: 127,
  });
  const data = await fetchJson(`KMA ${endpoint}`, url, { headers: { Accept: "application/json" } });
  const code = data?.response?.header?.resultCode;
  assert(code === "00", `KMA ${endpoint} resultCode ${code || "missing"}`);
  const item = data?.response?.body?.items?.item;
  assert(Array.isArray(item) && item.length > 0, `KMA ${endpoint} returned no items`);
  return item;
}

async function gemini() {
  const model = env("GEMINI_MODEL", DEFAULTS.GEMINI_MODEL);
  const url = buildUrl(env("GEMINI_BASE_URL", DEFAULTS.GEMINI_BASE_URL), `v1beta/models/${model}:generateContent`, {
    key: env("GEMINI_API_KEY"),
  });
  const data = await fetchJson("Gemini generateContent", url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: 'Return only this JSON: {"ok":true,"service":"gemini"}' }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
        maxOutputTokens: 900,
      },
    }),
  });
  const text = data?.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  assert(typeof text === "string" && text.includes("gemini"), "Gemini response did not include expected JSON text");
  return model;
}

async function farmmap() {
  const pnu = optionalEnv("FARMMAP_TEST_PNU");
  if (!pnu) return { skipped: true, reason: "FARMMAP_TEST_PNU is empty" };

  const url = buildUrl(env("FARMMAP_BASE_URL", DEFAULTS.FARMMAP_BASE_URL), "farmmapApi/getFarmmapDataSeachPnu.do", {
    apiKey: env("FARMMAP_API_KEY"),
    domain: env("FARMMAP_DOMAIN", DEFAULTS.FARMMAP_DOMAIN),
    pnu,
    columnType: "KOR",
  });
  const text = await fetchText("Farmmap searchPnu", url, { headers: { Accept: "application/json, text/xml, */*" } });
  return { bytes: text.length };
}

async function standardRegion() {
  const key = optionalEnv("STANDARD_REGION_API_KEY");
  if (!key) return { skipped: true, reason: "STANDARD_REGION_API_KEY is empty" };

  const url = buildUrl(
    env("STANDARD_REGION_BASE_URL", DEFAULTS.STANDARD_REGION_BASE_URL),
    "getStanReginCdList",
    {
      ServiceKey: key,
      type: "json",
      pageNo: 1,
      numOfRows: 3,
      flag: "Y",
      locatadd_nm: "서울특별시",
    },
  );
  const text = await fetchText("Standard region legal-dong code", url, {
    headers: { Accept: "application/json, text/xml, */*" },
  });
  assert(text.includes("region_cd") || text.includes("<region_cd>"), "Standard region response has no region_cd");
  return { bytes: text.length };
}

async function npmsIntegratedSearch() {
  const key = optionalEnv("NCPMS_API_KEY");
  if (!key) return { skipped: true, reason: "NCPMS_API_KEY is empty" };

  const url = new URL(env("NCPMS_BASE_URL", DEFAULTS.NCPMS_BASE_URL));
  for (const [name, value] of Object.entries({
    apiKey: key,
    serviceCode: "SVC16",
    serviceType: "AA003",
    cropCode: "VC010803",
    divCode: "NP01",
    displayCount: 3,
    startPoint: 1,
  })) {
    url.searchParams.set(name, String(value));
  }
  const data = await fetchJson("NCPMS integrated pest search", url, { headers: { Accept: "application/json" } });
  const items = data?.service?.list;
  assert(Array.isArray(items) && items.some((item) => item.cropName === "토마토"), "NCPMS SVC16 returned no tomato candidates");
  return { items: items.length };
}

async function psisRegistrationSearch() {
  const key = optionalEnv("PSIS_API_KEY");
  if (!key) return { skipped: true, reason: "PSIS_API_KEY is empty" };

  const url = new URL(env("PSIS_BASE_URL", DEFAULTS.PSIS_BASE_URL));
  for (const [name, value] of Object.entries({
    apiKey: key,
    serviceCode: "SVC01",
    serviceType: "AA001",
    cropName: "벼",
    cropCheck: "Y",
    diseaseWeedName: "세균벼알마름병",
    similarFlag: "N",
    displayCount: 2,
    startPoint: 1,
  })) {
    url.searchParams.set(name, String(value));
  }

  const xml = await fetchText("PSIS pesticide registration search", url, {
    headers: { Accept: "text/xml, application/xml, */*" },
  });
  const errorCode = xmlText(xml, "errorCode");
  if (errorCode) {
    throw new Error(`PSIS SVC01 errorCode ${errorCode}${xmlText(xml, "errorMsg") ? ` (${xmlText(xml, "errorMsg")})` : ""}`);
  }

  const items = xmlItems(xml);
  assert(items.some((item) => item.pestiCode && item.dilutUnit && item.useSuittime), "PSIS SVC01 returned no pesticide safety-use fields");
  return { items: items.length };
}

async function run(name, task) {
  const started = Date.now();
  try {
    const info = await task();
    const elapsed = Date.now() - started;
    if (info?.skipped) {
      results.push({ name, status: "SKIP", detail: info.reason, elapsed });
      return;
    }
    results.push({ name, status: "OK", detail: info ? JSON.stringify(info) : "", elapsed });
  } catch (error) {
    const elapsed = Date.now() - started;
    results.push({
      name,
      status: "FAIL",
      detail: error instanceof Error ? error.message : "unknown error",
      elapsed,
    });
  }
}

await run("Nongsaro weekly farm info", async () => {
  const items = await nongsaro("weekFarmInfo", "weekFarmInfoList", { pageNo: 1, numOfRows: 3 });
  assert(items.some((item) => item.subject), "weekFarmInfoList returned no subject field");
  return { items: items.length };
});

let pestYear = String(new Date().getFullYear());
await run("Nongsaro pest occurrence year", async () => {
  const items = await nongsaro("dbyhsCccrrncInfo", "dbyhsCccrrncInfoYear");
  pestYear = latestYear(items);
  assert(/^\d{4}$/.test(pestYear), "dbyhsCccrrncInfoYear returned no usable year");
  return { year: pestYear, items: items.length };
});

await run("Nongsaro pest occurrence list", async () => {
  const items = await nongsaro("dbyhsCccrrncInfo", "dbyhsCccrrncInfoList", {
    sYear: pestYear,
    pageNo: 1,
  });
  assert(items.some((item) => item.cntntsSj), "dbyhsCccrrncInfoList returned no title field");
  return { items: items.length };
});

let workGroupCode = "";
await run("Nongsaro work schedule group", async () => {
  const items = await nongsaro("farmWorkingPlanNew", "workScheduleGrpList");
  const first = items.find((item) => item.kidofcomdtySeCode && item.codeNm);
  assert(first, "workScheduleGrpList returned no usable group");
  workGroupCode = first.kidofcomdtySeCode;
  return { items: items.length };
});

let workContentNo = "";
await run("Nongsaro work schedule list", async () => {
  assert(workGroupCode, "work schedule group code is missing");
  const items = await nongsaro("farmWorkingPlanNew", "workScheduleLst", {
    kidofcomdtySeCode: workGroupCode,
  });
  const first = items.find((item) => item.cntntsNo && item.sj);
  assert(first, "workScheduleLst returned no usable schedule");
  workContentNo = first.cntntsNo;
  return { items: items.length };
});

await run("Nongsaro work schedule detail", async () => {
  assert(workContentNo, "work schedule content number is missing");
  const items = await nongsaro("farmWorkingPlanNew", "workScheduleEraInfoLst", {
    cntntsNo: workContentNo,
  });
  assert(items.length > 0, "workScheduleEraInfoLst returned no items");
  return { items: items.length };
});

await run("Nongsaro pesticide safety manual", async () => {
  const items = await nongsaro("agchmSafeManual", "agchmSafeManualList", {
    pageNo: 1,
  });
  assert(items.some((item) => item.cntntsSj), "agchmSafeManualList returned no title field");
  return { items: items.length };
});

let disasterYear = String(new Date().getFullYear());
await run("Nongsaro disaster prevention year", async () => {
  const items = await nongsaro("frcDsstrPrevnt", "frcDsstrPrevntYear", {
    sType: "sCntntsSj",
    sText: "호우",
  });
  disasterYear = latestYear(items);
  assert(/^\d{4}$/.test(disasterYear), "frcDsstrPrevntYear returned no usable year");
  return { year: disasterYear, items: items.length };
});

await run("Nongsaro disaster prevention list", async () => {
  const items = await nongsaro("frcDsstrPrevnt", "frcDsstrPrevntLst", {
    sYear: disasterYear,
    pageNo: 1,
    numOfRows: 5,
  });
  assert(items.some((item) => item.cntntsSj), "frcDsstrPrevntLst returned no title field");
  return { items: items.length };
});

await run("KMA ultra short actual", async () => {
  const items = await kma("ultraSrtNcst", resolveUltraSrtNcst());
  return { items: items.length };
});

await run("KMA village forecast", async () => {
  const items = await kma("vilageFcst", resolveVilageFcst());
  return { items: items.length };
});

await run("Gemini text JSON", async () => {
  const model = await gemini();
  return { model };
});

await run("Standard region legal-dong code", standardRegion);

await run("Farmmap PNU lookup", farmmap);

await run("NCPMS integrated pest search", npmsIntegratedSearch);

await run("PSIS pesticide registration search", psisRegistrationSearch);

for (const result of results) {
  const suffix = result.detail ? ` - ${result.detail}` : "";
  console.log(`${result.status} ${result.name} (${result.elapsed}ms)${suffix}`);
}

const failures = results.filter((result) => result.status === "FAIL");
if (failures.length > 0) {
  console.error(`${failures.length} API smoke check(s) failed.`);
  process.exitCode = 1;
}
