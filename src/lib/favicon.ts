import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { UPLOADS_DIR, ensureUploadsDir } from "@/lib/uploads";

/**
 * Multi-strategy favicon fetcher.
 *
 * Tries several sources in order until one returns a real favicon:
 *   1. Fetch the site's HTML <head> and extract <link rel="icon">,
 *      <link rel="shortcut icon">, or <link rel="apple-touch-icon"> href.
 *   2. Try common favicon paths: /favicon.ico, /favicon.png, /favicon.svg
 *   3. Fall back to DuckDuckGo's favicon service (icons.duckduckgo.com),
 *      which is more reliable than Google S2 for smaller/newer sites.
 *
 * If the whole chain fails, it retries once after a short backoff (#95)
 * before giving up and letting the link fall back to its letter icon —
 * a transient timeout or rate limit no longer permanently degrades the
 * link until someone re-saves it.
 *
 * All fetched favicons are cached locally in the uploads directory so we
 * never re-fetch the same domain. No third-party domain is ever contacted
 * by the visitor's browser — the fetch happens server-side at link creation
 * time, and the cached file is served from /api/uploads/.
 */

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Hard cap on the ENTIRE icon phase — headers, body reads, every strategy,
 * href attempt, and the #95 retry combined. Each fetch's own timeout covers
 * headers AND body (the timeout stays armed until the body finishes), and
 * this deadline bounds the chain as a whole so a link save can never block
 * indefinitely on icon fetching.
 */
const PHASE_CAP_MS = 12_000;

/**
 * Backoff before the single retry of the favicon chain (#95). Transient
 * timeouts and rate limits clear well within a second; one retry catches
 * them without making genuinely dead sites much slower to give up on.
 */
const FAVICON_RETRY_DELAY_MS = 750;

/** File extensions a cached favicon may be stored under. */
const FAVICON_EXTS = [".png", ".svg", ".jpg", ".jpeg", ".webp", ".gif", ".ico"];

/**
 * Extract the hostname from a URL string.
 * Returns null for non-HTTP(s) links (mailto, tel, etc.).
 */
export function extractDomain(url: string): string | null {
  try {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return null;
    }
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

interface CandidateResult {
  buffer: Buffer;
  ext: string;
}

/**
 * Fetch a favicon for a domain using a multi-strategy fallback chain.
 * Returns the local URL path (/api/uploads/<hash>.png) or null.
 *
 * The whole chain runs at most twice: one attempt, then a single retry
 * after FAVICON_RETRY_DELAY_MS when nothing was found (#95). Cache hits
 * return immediately and never retry.
 */
export async function fetchAndCacheFavicon(url: string): Promise<string | null> {
  const domain = extractDomain(url);
  if (!domain) return null;

  // Stable filename from domain hash.
  const hash = crypto.createHash("sha256").update(domain).digest("hex").slice(0, 16);
  const filename = `favicon-${hash}.png`;
  const filepath = path.join(UPLOADS_DIR, filename);

  // Cache hit: file already exists.
  try {
    await fs.access(filepath);
    return `/api/uploads/${filename}`;
  } catch {
    // Not cached — proceed to fetch.
  }

  await ensureUploadsDir();

  // One attempt, then a single retry after a short backoff (#95): a
  // transient timeout or rate limit no longer permanently degrades the
  // link to the letter icon until someone re-saves it. The retry is
  // skipped when the phase deadline is already spent.
  const deadline = Date.now() + PHASE_CAP_MS;
  let result =
    (await tryHtmlHeadLinks(url, deadline)) ??
    (await tryCommonPaths(domain, deadline)) ??
    (await tryDuckDuckGo(domain, deadline));

  if (!result && Date.now() < deadline) {
    await sleep(FAVICON_RETRY_DELAY_MS);
    result =
      (await tryHtmlHeadLinks(url, deadline)) ??
      (await tryCommonPaths(domain, deadline)) ??
      (await tryDuckDuckGo(domain, deadline));
  }

  if (!result) return null;

  // Validate: skip suspiciously small files (likely 1x1 placeholders).
  if (result.buffer.length < 100) return null;

  // Normalize extension in the filename for non-PNG formats.
  const finalName = result.ext === ".png" ? filename : `favicon-${hash}${result.ext}`;
  const finalPath = path.join(UPLOADS_DIR, finalName);

  try {
    await fs.writeFile(finalPath, result.buffer);
    return `/api/uploads/${finalName}`;
  } catch {
    return null;
  }
}

// ─── Strategy 1: Parse the site's HTML <head> ───────────────────────────

/** Promise-based sleep for retry backoffs. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cache-only lookup: return the locally cached favicon URL for a domain,
 * or null when nothing is cached. Never touches the network — safe to call
 * per-render on dashboard pages.
 */
export async function getCachedFaviconUrl(url: string): Promise<string | null> {
  const domain = extractDomain(url);
  if (!domain) return null;
  const hash = crypto
    .createHash("sha256")
    .update(domain)
    .digest("hex")
    .slice(0, 16);
  for (const ext of FAVICON_EXTS) {
    const name = `favicon-${hash}${ext}`;
    try {
      await fs.access(path.join(UPLOADS_DIR, name));
      return `/api/uploads/${name}`;
    } catch {
      // Not cached under this extension — try the next.
    }
  }
  return null;
}

/**
 * Read a response body with a hard byte cap — streaming, so an
 * attacker-controlled oversized body is aborted mid-download instead of
 * buffered whole (memory-exhaustion DoS). Mirrors the og-fetcher pattern.
 */
async function readBodyWithCap(res: Response, cap: number): Promise<Buffer | null> {
  const len = Number(res.headers.get("content-length") || 0);
  if (len > cap) return null;
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Arm the per-fetch abort so it covers headers AND the full body read.
 * The delay is capped by the icon-phase `deadline`, so a stalled chain
 * cannot outlive the phase cap. Clear the returned timer in a `finally`.
 */
function armFetchTimeout(controller: AbortController, deadline: number): ReturnType<typeof setTimeout> {
  const remaining = deadline - Date.now();
  return setTimeout(() => controller.abort(), Math.min(FETCH_TIMEOUT_MS, Math.max(0, remaining)));
}

async function tryHtmlHeadLinks(url: string, deadline: number): Promise<CandidateResult | null> {
  const controller = new AbortController();
  // The timeout stays armed until the body read finishes (cleared in the
  // finally below): a server that sends headers promptly then stalls the
  // body mid-stream is aborted instead of hanging the link save forever.
  const timeout = armFetchTimeout(controller, deadline);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "LinkBreeze/1.0 (link preview fetcher)",
        Accept: "text/html",
      },
    });

    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    // Read up to 256KB (enough for <head>) — enforced, not assumed.
    const body = await readBodyWithCap(res, 256 * 1024);
    if (!body) return null;
    const text = body.toString("utf8");

    // Find all <link rel="icon"> / shortcut icon / apple-touch-icon hrefs.
    const hrefs = extractIconHrefs(text, url);
    if (hrefs.length === 0) return null;

    // Try each href until one returns a valid image.
    for (const href of hrefs) {
      if (Date.now() >= deadline) return null;
      const img = await fetchImage(href, deadline);
      if (img && img.buffer.length >= 100) return img;
    }
  } catch {
    // Network error, timeout — fall through to next strategy.
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

function extractIconHrefs(html: string, baseUrl: string): string[] {
  const hrefs: string[] = [];

  // Match <link ... rel="...icon..." ... href="...">
  // Also handles rel before href and href before rel ordering.
  const linkRegex = /<link\s[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const relMatch = tag.match(/rel\s*=\s*["']([^"']*)["']/i);
    if (!relMatch) continue;
    const rel = relMatch[1].toLowerCase();
    if (
      !rel.includes("icon") &&
      !rel.includes("shortcut") &&
      !rel.includes("apple-touch")
    ) {
      continue;
    }

    const hrefMatch = tag.match(/href\s*=\s*["']([^"']*)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (!href) continue;

    // Resolve relative URLs.
    try {
      const absolute = new URL(href, baseUrl).href;
      hrefs.push(absolute);
    } catch {
      // Invalid URL — skip.
    }
  }

  return hrefs;
}

// ─── Strategy 2: Try common favicon paths ──────────────────────────────

async function tryCommonPaths(domain: string, deadline: number): Promise<CandidateResult | null> {
  const paths = ["/favicon.ico", "/favicon.png", "/favicon.svg", "/favicon-32x32.png", "/favicon-96x96.png"];
  for (const p of paths) {
    if (Date.now() >= deadline) return null;
    const fullUrl = `https://${domain}${p}`;
    const img = await fetchImage(fullUrl, deadline);
    if (img && img.buffer.length >= 100) return img;
  }
  return null;
}

// ─── Strategy 3: DuckDuckGo fallback ────────────────────────────────────

async function tryDuckDuckGo(domain: string, deadline: number): Promise<CandidateResult | null> {
  const ddgUrl = `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
  return fetchImage(ddgUrl, deadline);
}

// ─── Shared: fetch + validate an image URL ──────────────────────────────

async function fetchImage(imageUrl: string, deadline: number): Promise<CandidateResult | null> {
  const controller = new AbortController();
  // Timeout stays armed through the body read — see tryHtmlHeadLinks.
  const timeout = armFetchTimeout(controller, deadline);
  try {
    const res = await fetch(imageUrl, {
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const buffer = await readBodyWithCap(res, 1024 * 1024);
    if (!buffer || buffer.length === 0) return null;

    // Determine extension from content type or magic bytes.
    const ext = detectExt(contentType, buffer);
    if (!ext) return null;

    return { buffer, ext };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function detectExt(contentType: string, buffer: Buffer): string | null {
  // Content-type first
  if (contentType.includes("svg")) return ".svg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("icon") || contentType.includes("x-ico")) return ".ico";

  // Magic bytes fallback
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return ".png"; // PNG
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return ".jpg"; // JPEG
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return ".gif"; // GIF
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return ".webp"; // RIFF = WebP
  if (buffer[0] === 0x3c && buffer[1] === 0x3f) return ".svg"; // <?xml
  if (buffer[0] === 0x3c && buffer[1] === 0x73) return ".svg"; // <svg
  if (buffer[0] === 0x00 && buffer[1] === 0x00) return ".ico"; // ICO

  // ICO files have varied signatures — check for the common one
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01) return ".ico";

  return null;
}
