import { createClient } from "@supabase/supabase-js";
import {
  CORS_HEADERS,
  ProxyError,
  ensureMethod,
  handleCors,
  handleProxyError,
  jsonResponse,
  readJson,
  requireEnv,
} from "@shared/http.ts";
import {
  normalizeProductLabel,
  resolveOfficialPesticideSource,
  type OfficialPesticideSource,
} from "./sourcePolicy.ts";

const BUCKET_NAME = "pesticide-product-images";
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const UPSTREAM_TIMEOUT_MS = 15_000;

interface IngestRequest {
  pestiCode?: unknown;
  sourcePageUrl?: unknown;
  sourceImageUrl?: unknown;
  altText?: unknown;
  imageBase64?: unknown;
  pageEvidenceText?: unknown;
  pageEvidenceImageUrl?: unknown;
}

interface ProductRow {
  pesti_code: string;
  brand_name: string;
  company_name: string | null;
  item_name: string;
}

interface DetectedImage {
  bytes: Uint8Array;
  extension: "jpg" | "png" | "webp";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseSourceUrl(value: unknown, fieldName: string, allowHttp = false): URL {
  const raw = text(value);
  if (!raw) {
    throw new ProxyError(400, `${fieldName} is required.`, `missing_${fieldName}`);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProxyError(400, `${fieldName} must be a valid URL.`, `invalid_${fieldName}`);
  }

  const protocolAllowed = url.protocol === "https:" || (allowHttp && url.protocol === "http:");
  if (!protocolAllowed || url.username || url.password) {
    throw new ProxyError(
      400,
      `${fieldName} must use an allowed protocol without embedded credentials.`,
      `invalid_${fieldName}`,
    );
  }
  return url;
}

function timingSafeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
}

function requireIngestToken(request: Request): void {
  const expected = requireEnv("PESTICIDE_MEDIA_INGEST_TOKEN");
  const supplied = request.headers.get("x-fieldguard-ingest-token") ?? "";
  if (!supplied || !timingSafeEqual(supplied, expected)) {
    throw new ProxyError(401, "Invalid media ingest token.", "invalid_ingest_token");
  }
}

function assertOfficialUrl(
  companyName: string,
  url: URL,
  expectedSource?: OfficialPesticideSource,
  allowHttp = false,
): OfficialPesticideSource {
  const policyUrl = url.protocol === "http:" && allowHttp
    ? new URL(url.href.replace(/^http:/, "https:"))
    : url;
  const source = resolveOfficialPesticideSource(companyName, policyUrl);
  if (!source || (expectedSource && source.sourceLabel !== expectedSource.sourceLabel)) {
    throw new ProxyError(
      400,
      "URL is not on the product manufacturer's approved official domain.",
      "unapproved_manufacturer_url",
    );
  }
  return source;
}

async function fetchOfficial(
  initialUrl: URL,
  companyName: string,
  expectedSource: OfficialPesticideSource,
  accept: string,
  allowHttp = false,
): Promise<Response> {
  let url = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    assertOfficialUrl(companyName, url, expectedSource, allowHttp);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(url, {
        redirect: "manual",
        headers: {
          Accept: accept,
          "User-Agent": "FieldGuard-Pesticide-Media-Ingest/1.0",
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ProxyError(504, "Official source request timed out.", "source_timeout");
      }
      throw new ProxyError(502, "Could not reach the official source.", "source_unavailable");
    } finally {
      clearTimeout(timer);
    }

    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirectCount === MAX_REDIRECTS) {
      throw new ProxyError(502, "Official source redirected too many times.", "source_redirect_error");
    }
    url = new URL(location, url);
  }

  throw new ProxyError(502, "Official source redirect failed.", "source_redirect_error");
}

async function readLimitedBytes(
  response: Response,
  maxBytes: number,
  errorCode: string,
): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ProxyError(413, "Official source payload is too large.", errorCode);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new ProxyError(413, "Official source payload is empty or too large.", errorCode);
  }
  return bytes;
}

function detectImage(bytes: Uint8Array): DetectedImage {
  const isJpeg = bytes.length > 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) return { bytes, extension: "jpg", mimeType: "image/jpeg" };

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = bytes.length >= pngSignature.length &&
    pngSignature.every((value, index) => bytes[index] === value);
  if (isPng) return { bytes, extension: "png", mimeType: "image/png" };

  const isWebp = bytes.length > 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (isWebp) return { bytes, extension: "webp", mimeType: "image/webp" };

  throw new ProxyError(415, "Source is not a supported JPEG, PNG, or WebP image.", "unsupported_image");
}

function decodeSubmittedImage(value: unknown): Uint8Array | null {
  const encoded = text(value);
  if (!encoded) return null;
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 16) {
    throw new ProxyError(413, "Submitted product image is too large.", "product_image_too_large");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new ProxyError(400, "Submitted product image is not valid base64.", "invalid_image_base64");
  }
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new ProxyError(413, "Submitted product image is empty or too large.", "product_image_too_large");
    }
    return bytes;
  } catch (error) {
    if (error instanceof ProxyError) throw error;
    throw new ProxyError(400, "Submitted product image is not valid base64.", "invalid_image_base64");
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

function pageReferencesImage(pageHtml: string, pageUrl: URL, imageUrl: URL): boolean {
  const decoded = pageHtml.replaceAll("&amp;", "&");
  const absolute = imageUrl.href;
  const pathAndQuery = `${imageUrl.pathname}${imageUrl.search}`;
  const relative = new URL(pathAndQuery, pageUrl).href;
  return decoded.includes(absolute) ||
    decoded.includes(pathAndQuery) ||
    decoded.includes(relative);
}

async function verifyProductPage(
  pageUrl: URL,
  imageUrl: URL,
  product: ProductRow,
  source: OfficialPesticideSource,
): Promise<void> {
  const response = await fetchOfficial(
    pageUrl,
    product.company_name ?? "",
    source,
    "text/html,application/xhtml+xml",
  );
  if (!response.ok) {
    throw new ProxyError(502, "Official product page returned an error.", "product_page_error");
  }

  const bytes = await readLimitedBytes(response, MAX_PAGE_BYTES, "product_page_too_large");
  const html = new TextDecoder("utf-8").decode(bytes);
  const normalizedHtml = normalizeProductLabel(html);
  const normalizedBrand = normalizeProductLabel(product.brand_name);

  if (!normalizedBrand || !normalizedHtml.includes(normalizedBrand)) {
    throw new ProxyError(
      422,
      "Official page does not contain the PSIS product brand.",
      "brand_not_found_on_page",
    );
  }
  if (!pageReferencesImage(html, pageUrl, imageUrl)) {
    throw new ProxyError(
      422,
      "Official page does not reference the submitted image.",
      "image_not_found_on_page",
    );
  }
}

function verifySubmittedPageEvidence(
  body: IngestRequest,
  product: ProductRow,
  sourceImageUrl: URL,
): void {
  const evidenceText = text(body.pageEvidenceText).slice(0, 20_000);
  const evidenceImageUrl = parseSourceUrl(
    body.pageEvidenceImageUrl,
    "page_evidence_image_url",
    true,
  );
  if (
    normalizeProductLabel(evidenceText).includes(normalizeProductLabel(product.brand_name)) &&
    evidenceImageUrl.href === sourceImageUrl.href
  ) return;

  throw new ProxyError(
    422,
    "Submitted official-page evidence does not match the PSIS product and image.",
    "invalid_product_page_evidence",
  );
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    ensureMethod(request, ["POST"]);
    requireIngestToken(request);
    const body = await readJson<IngestRequest>(request);
    const pestiCode = text(body.pestiCode);
    if (!pestiCode || !/^[\p{L}\p{N}._-]{1,80}$/u.test(pestiCode)) {
      throw new ProxyError(400, "pestiCode is invalid.", "invalid_pesti_code");
    }

    const sourcePageUrl = parseSourceUrl(body.sourcePageUrl, "source_page_url");
    const sourceImageUrl = parseSourceUrl(body.sourceImageUrl, "source_image_url", true);
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: product, error: productError } = await supabase
      .from("psis_pesticide_products")
      .select("pesti_code,brand_name,company_name,item_name")
      .eq("pesti_code", pestiCode)
      .maybeSingle<ProductRow>();

    if (productError) {
      throw new ProxyError(500, "Could not read pesticide product.", "product_lookup_failed");
    }
    if (!product) {
      throw new ProxyError(404, "PSIS pesticide product was not found.", "product_not_found");
    }
    if (!product.company_name) {
      throw new ProxyError(422, "PSIS product has no manufacturer.", "manufacturer_missing");
    }

    const source = assertOfficialUrl(product.company_name, sourcePageUrl);
    assertOfficialUrl(product.company_name, sourceImageUrl, source, true);
    if (
      sourceImageUrl.protocol === "http:" &&
      sourceImageUrl.hostname.toLowerCase() !== sourcePageUrl.hostname.toLowerCase()
    ) {
      throw new ProxyError(
        400,
        "HTTP image URL must use the exact verified product-page host.",
        "insecure_image_host_mismatch",
      );
    }
    try {
      await verifyProductPage(sourcePageUrl, sourceImageUrl, product, source);
    } catch (error) {
      const mayUseEvidence = error instanceof ProxyError &&
        [
          "source_unavailable",
          "source_timeout",
          "product_page_error",
          "image_not_found_on_page",
        ].includes(error.code) &&
        text(body.pageEvidenceText) &&
        text(body.pageEvidenceImageUrl);
      if (!mayUseEvidence) throw error;
      verifySubmittedPageEvidence(body, product, sourceImageUrl);
    }

    const submittedImage = decodeSubmittedImage(body.imageBase64);
    let image: DetectedImage;
    if (submittedImage) {
      image = detectImage(submittedImage);
    } else {
      const imageResponse = await fetchOfficial(
        sourceImageUrl,
        product.company_name,
        source,
        "image/avif,image/webp,image/png,image/jpeg",
        true,
      );
      if (!imageResponse.ok) {
        throw new ProxyError(502, "Official product image returned an error.", "product_image_error");
      }
      image = detectImage(
        await readLimitedBytes(imageResponse, MAX_IMAGE_BYTES, "product_image_too_large"),
      );
    }
    const hash = await sha256Hex(image.bytes);
    const objectPath = `${pestiCode}/${hash}.${image.extension}`;
    const { data: primaryRows, error: primaryError } = await supabase
      .from("psis_pesticide_media")
      .select("id")
      .eq("pesti_code", pestiCode)
      .eq("is_primary", true)
      .limit(1);
    if (primaryError) {
      throw new ProxyError(500, "Could not read pesticide media.", "media_lookup_failed");
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(objectPath, image.bytes, {
        contentType: image.mimeType,
        cacheControl: "31536000",
        upsert: true,
      });
    if (uploadError) {
      throw new ProxyError(500, "Could not store product image.", "image_upload_failed");
    }

    const publicImageUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(objectPath)
      .data.publicUrl;
    const altText = text(body.altText).slice(0, 240) ||
      `${product.brand_name} 농약 제품 이미지`;
    const mediaRecord = {
        pesti_code: pestiCode,
        image_url: publicImageUrl,
        source_url: sourcePageUrl.href,
        source_image_url: sourceImageUrl.href,
        source_type: "manufacturer",
        source_label: source.sourceLabel,
        verification_status: "verified",
        is_primary: (primaryRows?.length ?? 0) === 0,
        alt_text: altText,
        last_verified_at: new Date().toISOString(),
        storage_object_path: objectPath,
        content_sha256: hash,
        mime_type: image.mimeType,
        byte_size: image.bytes.byteLength,
        match_confidence: 1,
        match_method: "official_brand_exact",
        license_note:
          "Official manufacturer product image mirrored for product identification; rights remain with the source.",
      };
    let { error: mediaError } = await supabase
      .from("psis_pesticide_media")
      .upsert(mediaRecord, { onConflict: "pesti_code,image_url" });

    if (mediaError?.code === "23505" && mediaRecord.is_primary) {
      mediaRecord.is_primary = false;
      ({ error: mediaError } = await supabase
        .from("psis_pesticide_media")
        .upsert(mediaRecord, { onConflict: "pesti_code,image_url" }));
    }

    if (mediaError) {
      await supabase.storage.from(BUCKET_NAME).remove([objectPath]);
      throw new ProxyError(500, "Could not save product image metadata.", "media_upsert_failed");
    }

    return jsonResponse(200, {
      status: "stored",
      pestiCode,
      brandName: product.brand_name,
      imageUrl: publicImageUrl,
      sourcePageUrl: sourcePageUrl.href,
      byteSize: image.bytes.byteLength,
      contentSha256: hash,
    });
  } catch (error) {
    return handleProxyError(error);
  }
});

export { CORS_HEADERS };
