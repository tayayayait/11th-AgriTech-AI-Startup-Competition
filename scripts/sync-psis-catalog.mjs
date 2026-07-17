import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

function loadLocalEnv(path = ".env") {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(name in process.env)) process.env[name] = value;
  }
}

function numberArg(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`--${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function writeProgress(path, progress) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.next`;
  writeFileSync(temporaryPath, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}

function readProgress(path) {
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

loadLocalEnv();

const pageSize = numberArg("page-size", 50, { min: 1, max: 50 });
const concurrency = numberArg("concurrency", 2, { min: 1, max: 4 });
const delayMs = numberArg("delay-ms", 250, { min: 0, max: 10000 });
const maxPages = numberArg("max-pages", Number.MAX_SAFE_INTEGER);
const progressPath = resolve(
  process.argv.find((arg) => arg.startsWith("--progress="))?.slice("--progress=".length) ??
    "tmp/psis-catalog-sync.progress.json",
);

const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !publishableKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required.");
}

const endpoint = `${supabaseUrl}/functions/v1/psis-proxy`;
const headers = {
  apikey: publishableKey,
  Authorization: `Bearer ${publishableKey}`,
  "Content-Type": "application/json; charset=utf-8",
};

async function fetchPage(startPoint) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          serviceCode: "SVC01",
          params: {
            serviceType: "AA001",
            displayCount: pageSize,
            startPoint,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${payload?.code ?? payload?.error ?? "unknown"}`);
      }
      if (payload?.catalogCache?.status !== "stored") {
        throw new Error(`Catalog cache status: ${payload?.catalogCache?.status ?? "missing"}`);
      }
      const totalCount = Number(payload?.data?.service?.totalCount);
      if (!Number.isSafeInteger(totalCount) || totalCount < 0) {
        throw new Error("PSIS totalCount is missing or invalid.");
      }
      return {
        startPoint,
        totalCount,
        itemCount: Array.isArray(payload?.data?.service?.list)
          ? payload.data.service.list.length
          : 0,
        products: Number(payload.catalogCache.products) || 0,
        registrations: Number(payload.catalogCache.registrations) || 0,
        skipped: Number(payload.catalogCache.skipped) || 0,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

const previous = readProgress(progressPath);
let nextStart = Number.isSafeInteger(previous?.nextStart) && previous.nextStart > 0
  ? previous.nextStart
  : 1;
let totalCount = Number.isSafeInteger(previous?.totalCount) ? previous.totalCount : null;
let completedPages = Number.isSafeInteger(previous?.completedPages) ? previous.completedPages : 0;
let runPages = 0;
let cachedProducts = 0;
let cachedRegistrations = 0;
let skipped = 0;
const startedAt = new Date().toISOString();

while (runPages < maxPages) {
  const remainingStarts = Array.from({ length: concurrency }, (_, index) =>
    nextStart + index * pageSize
  ).filter((startPoint) =>
    (totalCount === null || startPoint <= totalCount) && runPages + (startPoint - nextStart) / pageSize < maxPages
  );

  if (remainingStarts.length === 0) break;

  const results = await Promise.all(remainingStarts.map(fetchPage));
  totalCount = results[0].totalCount;
  runPages += results.length;
  completedPages += results.length;
  nextStart += results.length * pageSize;
  cachedProducts += results.reduce((sum, result) => sum + result.products, 0);
  cachedRegistrations += results.reduce((sum, result) => sum + result.registrations, 0);
  skipped += results.reduce((sum, result) => sum + result.skipped, 0);

  writeProgress(progressPath, {
    status: nextStart > totalCount ? "completed" : "running",
    pageSize,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
    completedPages,
    nextStart,
    updatedAt: new Date().toISOString(),
  });

  if (completedPages % 20 < results.length || nextStart > totalCount) {
    console.log(JSON.stringify({
      event: "progress",
      completedPages,
      totalPages: Math.ceil(totalCount / pageSize),
      nextStart,
      cachedProducts,
      cachedRegistrations,
      skipped,
    }));
  }

  if (nextStart > totalCount) break;
  if (delayMs > 0) await sleep(delayMs);
}

console.log(JSON.stringify({
  event: "finished",
  status: totalCount !== null && nextStart > totalCount ? "completed" : "paused",
  startedAt,
  completedAt: new Date().toISOString(),
  runPages,
  completedPages,
  totalPages: totalCount === null ? null : Math.ceil(totalCount / pageSize),
  cachedProducts,
  cachedRegistrations,
  skipped,
  progressPath,
}));
