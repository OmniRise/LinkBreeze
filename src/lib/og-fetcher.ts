import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { preview, validateUrl } from "linkpeek";
import { UPLOADS_DIR, ensureUploadsDir } from "@/lib/uploads";
import { extractDomain } from "@/lib/favicon";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 512 * 1024; // 512KB — enough for <head>
const MAX_IMAGE_REDIRECTS = 3;

export interface OgData {
  title: string | null;
  description: string | null;
  imageUrl: string | null; // local cached path (/api/uploads/og-<hash>.jpg)
  siteName: string | null;
}

const EMPTY: OgData = { title: null, description: null, imageUrl: null, siteName: null };

/**
 * Fetch Open Graph metadata for a URL.
 *
 * linkpeek fetches the page (private/internal hosts blocked, every redirect
 * re-checked, byte limit, timeout covering the body read) and extracts
 * og:/twitter: tags with <title>/<meta description> fallbacks, decoding
 * entities and the page charset and resolving relative URLs. If an og:image
 * is found, it is downloaded and cached locally so we never expose the
 * visitor's IP to a third-party CDN.
 *
 * Returns null for all fields if the fetch fails or no OG tags are found.
 */
export async function fetchOgData(url: string): Promise<OgData> {
  if (!extractDomain(url)) return { ...EMPTY };

  try {
    const page = await preview(url, {
      timeout: FETCH_TIMEOUT_MS,
      maxBytes: MAX_HTML_BYTES,
      userAgent: "LinkBreeze/1.0 (link preview fetcher)",
    });
    if (page.statusCode >= 400) return { ...EMPTY };

    return {
      title: page.title,
      description: page.description,
      // Cache the OG image locally if present.
      imageUrl: page.image ? await cacheOgImage(page.image) : null,
      siteName: page.siteName,
    };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * Download and cache an OG image locally. `imageUrl` is already absolute
 * and http(s) (linkpeek resolves and filters it).
 * Returns the local URL path or null if download failed.
 */
async function cacheOgImage(imageUrl: string): Promise<string | null> {
  const hash = crypto.createHash("sha256").update(imageUrl).digest("hex").slice(0, 16);

  await ensureUploadsDir();

  // Detect extension from URL, default to .jpg
  let ext = ".jpg";
  const urlPath = new URL(imageUrl).pathname;
  const extMatch = urlPath.match(/\.(png|jpe?g|webp|gif|avif)$/i);
  if (extMatch) ext = `.${extMatch[1].toLowerCase()}`;

  const filename = `og-${hash}${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);

  // Cache hit
  try {
    await fs.access(filepath);
    return `/api/uploads/${filename}`;
  } catch {
    // Not cached — fetch it.
  }

  // Timeout stays armed through the body download — same rule as fetchOgData.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Follow redirects by hand so every hop gets the same private/internal
    // host check as the page fetch.
    let target = imageUrl;
    let res: Response;
    for (let hop = 0; ; hop++) {
      validateUrl(target);
      res = await fetch(target, { signal: controller.signal, redirect: "manual" });
      const location = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || !location) break;
      res.body?.cancel().catch(() => {});
      if (hop >= MAX_IMAGE_REDIRECTS) return null;
      target = new URL(location, target).href;
    }

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) return null; // 5MB max

    await fs.writeFile(filepath, buffer);
    return `/api/uploads/${filename}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
