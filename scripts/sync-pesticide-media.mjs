import {
  existsSync,
  mkdirSync,
  readFileSync,
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
    ) value = value.slice(1, -1);
    if (!(name in process.env)) process.env[name] = value;
  }
}

function numberArg(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (raw == null) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`--${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function stringArg(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\(\s*주\s*\)|주식회사|㈜/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripTags(value) {
  return decodeEntities(value.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function writeProgress(path, progress) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
}

function sleep(milliseconds) {
  return new Promise((done) => setTimeout(done, milliseconds));
}

async function fetchText(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "FieldGuard-Pesticide-Catalog-Sync/1.0",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`);
        if (response.status === 404 || response.status === 500) error.permanent = true;
        throw error;
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (error?.permanent) break;
      if (attempt < attempts) await sleep(600 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`Could not fetch ${url}: ${lastError?.message ?? lastError}`);
}

async function fetchImageBase64(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "image/avif,image/webp,image/png,image/jpeg",
          "User-Agent": "FieldGuard-Pesticide-Catalog-Sync/1.0",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) {
        throw new Error(`invalid image size: ${bytes.length}`);
      }
      return bytes.toString("base64");
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(600 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`Could not fetch image ${url}: ${lastError?.message ?? lastError}`);
}

function absoluteUrls(html, pageUrl, expression) {
  const values = new Set();
  for (const match of html.matchAll(expression)) {
    try {
      const url = new URL(decodeEntities(match[1]), pageUrl);
      values.add(url.href);
    } catch {
      // Ignore invalid URLs from third-party markup.
    }
  }
  return [...values];
}

function titleCandidates(html) {
  const candidates = [];
  for (const expression of [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/gi,
    /<title[^>]*>([\s\S]*?)<\/title>/gi,
    /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi,
    /<(?:p|strong)[^>]+class=["'][^"']*(?:tit|title|name)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|strong)>/gi,
  ]) {
    for (const match of html.matchAll(expression)) {
      const value = stripTags(match[1]);
      if (value) candidates.push(value);
    }
  }
  return [...new Set(candidates)];
}

const SOURCES = [
  {
    id: "farmhannong",
    companyPatterns: ["팜한농"],
    async detailUrls() {
      const urls = new Set();
      for (let page = 1; page <= 30; page += 1) {
        const listUrl =
          `https://www.farmhannong.com/kor/product/product_ct01/list.do?pageIndex=${page}`;
        const html = await fetchText(listUrl);
        for (const url of absoluteUrls(
          html,
          listUrl,
          /(?:href=["']([^"']*\/view\.do\?[^"']*seq=\d+[^"']*)["']|data-seq=["'](\d+)["'])/gi,
        )) urls.add(url);
        for (const match of html.matchAll(/data-seq=["'](\d+)["']/gi)) {
          urls.add(`https://www.farmhannong.com/kor/product/product_ct01/view.do?seq=${match[1]}`);
        }
        if (page > 15 && urls.size === 0) break;
      }
      return [...urls];
    },
    imageUrls(html, pageUrl) {
      return absoluteUrls(
        html,
        pageUrl,
        /(?:src|content)=["']([^"']*\/files\/products\/[^"']+\.(?:png|jpe?g|webp)(?:\?[^"']*)?)["']/gi,
      );
    },
  },
  {
    id: "30agro",
    companyPatterns: ["한국삼공"],
    async detailUrls() {
      const urls = new Set();
      let emptyPages = 0;
      for (let offset = 0; offset <= 600 && emptyPages < 2; offset += 12) {
        const listUrl =
          `https://www.30agro.co.kr/crop_protection_agent/crop_protection_agent.php?offset=${offset}`;
        const html = await fetchText(listUrl);
        const found = absoluteUrls(
          html,
          listUrl,
          /href=["']([^"']*crop_protection_agent_view\.php\?idx=\d+[^"']*)["']/gi,
        );
        emptyPages = found.length === 0 ? emptyPages + 1 : 0;
        found.forEach((url) => urls.add(url));
      }
      return [...urls];
    },
    imageUrls(html, pageUrl) {
      return absoluteUrls(
        html,
        pageUrl,
        /(?:src|content)=["']([^"']*\/uploaded\/board\/product\/t1_[^"']+\.(?:png|jpe?g|webp)(?:\?[^"']*)?)["']/gi,
      );
    },
  },
  {
    id: "dongbangagro",
    companyPatterns: ["동방아그로"],
    async detailUrls() {
      const indexUrl = "https://www.dongbangagro.co.kr/product_index.php";
      const html = await fetchText(indexUrl);
      return absoluteUrls(
        html,
        indexUrl,
        /href=["']([^"']*product_detail\.php\?nid=[^"'#]+)["']/gi,
      );
    },
    imageUrls(html, pageUrl) {
      return absoluteUrls(
        html,
        pageUrl,
        /(?:src|content)=["']([^"']*\/media\/product\/[^"']+\.(?:png|jpe?g|webp)(?:\?[^"']*)?)["']/gi,
      );
    },
  },
];

loadLocalEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const ingestToken = process.env.PESTICIDE_MEDIA_INGEST_TOKEN;
const dryRun = process.argv.includes("--dry-run");
const debug = process.argv.includes("--debug");
const missingOnly = process.argv.includes("--missing-only");
const sourceFilter = stringArg("source", "all");
const concurrency = numberArg("concurrency", 2, { min: 1, max: 4 });
const delayMs = numberArg("delay-ms", 350, { min: 0, max: 10_000 });
const maxDetails = numberArg("max-details", Number.MAX_SAFE_INTEGER, { min: 1 });
const progressPath = resolve(stringArg("progress", "tmp/pesticide-media-sync.progress.json"));

if (!supabaseUrl || !publishableKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required.");
}
if (!dryRun && !ingestToken) {
  throw new Error("PESTICIDE_MEDIA_INGEST_TOKEN is required unless --dry-run is used.");
}

const apiHeaders = {
  apikey: publishableKey,
  Authorization: `Bearer ${publishableKey}`,
  "Content-Type": "application/json; charset=utf-8",
};

async function getAllProducts() {
  const products = [];
  for (let offset = 0; ; offset += 1000) {
    const query = new URLSearchParams({
      select: "pesti_code,brand_name,company_name,item_name",
      order: "pesti_code.asc",
      offset: String(offset),
      limit: "1000",
    });
    const response = await fetch(`${supabaseUrl}/rest/v1/psis_pesticide_products?${query}`, {
      headers: apiHeaders,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Product catalog HTTP ${response.status}`);
    const rows = await response.json();
    products.push(...rows);
    if (rows.length < 1000) return products;
  }
}

async function getExistingMediaCodes() {
  const codes = new Set();
  for (let offset = 0; ; offset += 1000) {
    const query = new URLSearchParams({
      select: "pesti_code",
      verification_status: "eq.verified",
      offset: String(offset),
      limit: "1000",
    });
    const response = await fetch(`${supabaseUrl}/rest/v1/psis_pesticide_media?${query}`, {
      headers: apiHeaders,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Pesticide media HTTP ${response.status}`);
    const rows = await response.json();
    rows.forEach((row) => codes.add(row.pesti_code));
    if (rows.length < 1000) return codes;
  }
}

function productsForSource(products, source) {
  return products.filter((product) => {
    const company = normalize(product.company_name);
    return source.companyPatterns.some((pattern) => company.includes(normalize(pattern)));
  });
}

function matchProducts(products, headings) {
  const normalizedHeadings = headings.map(normalize).filter(Boolean);
  return products.filter((product) => {
    const brand = normalize(product.brand_name);
    return brand && normalizedHeadings.some((heading) =>
      heading === brand ||
      heading.startsWith(brand) ||
      heading.endsWith(brand) ||
      heading === `${brand}${normalize(product.item_name)}`
    );
  });
}

async function ingest(product, pageUrl, imageUrl, imageBase64, pageEvidenceText) {
  if (dryRun) return { status: "dry-run" };
  const response = await fetch(`${supabaseUrl}/functions/v1/pesticide-media-ingest`, {
    method: "POST",
    headers: {
      ...apiHeaders,
      "x-fieldguard-ingest-token": ingestToken,
    },
    body: JSON.stringify({
      pestiCode: product.pesti_code,
      sourcePageUrl: pageUrl,
      sourceImageUrl: imageUrl,
      altText: `${product.brand_name} 농약 제품 이미지`,
      imageBase64,
      pageEvidenceText,
      pageEvidenceImageUrl: imageUrl,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${payload.code ?? payload.error ?? "ingest_failed"}`);
  }
  return payload;
}

const products = await getAllProducts();
const existingMediaCodes = missingOnly ? await getExistingMediaCodes() : new Set();
const selectedSources = SOURCES.filter((source) =>
  sourceFilter === "all" || source.id === sourceFilter
);
if (selectedSources.length === 0) throw new Error(`Unknown --source=${sourceFilter}`);

const work = [];
for (const source of selectedSources) {
  const sourceProducts = productsForSource(products, source);
  const detailUrls = await source.detailUrls();
  console.log(JSON.stringify({
    event: "source_discovered",
    source: source.id,
    products: sourceProducts.length,
    detailUrls: detailUrls.length,
  }));
  for (const detailUrl of detailUrls) {
    work.push({ source, sourceProducts, detailUrl });
    if (work.length >= maxDetails) break;
  }
  if (work.length >= maxDetails) break;
}

let cursor = 0;
let processed = 0;
let checked = 0;
let matchedPages = 0;
let stored = 0;
let failed = 0;
let unmatched = 0;
const failures = [];
const startedAt = new Date().toISOString();

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= work.length) return;
    const { source, sourceProducts, detailUrl } = work[index];
    try {
      const html = await fetchText(detailUrl);
      const images = source.imageUrls(html, detailUrl);
      const matches = matchProducts(sourceProducts, titleCandidates(html))
        .filter((product) => !existingMediaCodes.has(product.pesti_code));
      if (debug) {
        console.log(JSON.stringify({
          event: "detail_debug",
          source: source.id,
          detailUrl,
          imageUrl: images[0] ?? null,
          headings: titleCandidates(html).slice(0, 8),
          matches: matches.map((product) => ({
            pestiCode: product.pesti_code,
            brandName: product.brand_name,
          })),
        }));
      }
      checked += 1;
      if (images.length === 0 || matches.length === 0) {
        unmatched += 1;
      } else {
        matchedPages += 1;
        const imageBase64 = dryRun ? "" : await fetchImageBase64(images[0]);
        const pageEvidenceText = titleCandidates(html).join("\n").slice(0, 20_000);
        for (const product of matches) {
          await ingest(product, detailUrl, images[0], imageBase64, pageEvidenceText);
          stored += 1;
          existingMediaCodes.add(product.pesti_code);
        }
      }
    } catch (error) {
      failed += 1;
      if (failures.length < 100) {
        failures.push({ detailUrl, error: error?.message ?? String(error) });
      }
    }
    processed += 1;

    writeProgress(progressPath, {
      status: processed >= work.length ? "completed" : "running",
      startedAt,
      updatedAt: new Date().toISOString(),
      totalProducts: products.length,
      totalDetails: work.length,
      processed,
      checked,
      matchedPages,
      stored,
      unmatched,
      failed,
      failures,
    });
    if (processed % 20 === 0) {
      console.log(JSON.stringify({
        event: "progress",
        totalDetails: work.length,
        processed,
        checked,
        stored,
        unmatched,
        failed,
      }));
    }
    if (delayMs > 0) await sleep(delayMs);
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
console.log(JSON.stringify({
  event: "finished",
  dryRun,
  totalProducts: products.length,
  totalDetails: work.length,
  processed,
  checked,
  matchedPages,
  stored,
  unmatched,
  failed,
  progressPath,
}));
