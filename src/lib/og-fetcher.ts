import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { UPLOADS_DIR, ensureUploadsDir } from "@/lib/uploads";
import { extractDomain } from "@/lib/favicon";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 512 * 1024; // 512KB — enough for <head>

export interface OgData {
  title: string | null;
  description: string | null;
  imageUrl: string | null; // local cached path (/api/uploads/og-<hash>.jpg)
  siteName: string | null;
}

/**
 * Fetch Open Graph metadata for a URL.
 *
 * Fetches the page HTML, extracts og:title, og:description, og:image,
 * and og:site_name meta tags. If an og:image is found, downloads and
 * caches it locally so we never expose the visitor's IP to a third-party
 * CDN.
 *
 * Returns null for all fields if the fetch fails or no OG tags are found.
 */
export async function fetchOgData(url: string): Promise<OgData> {
  const domain = extractDomain(url);
  if (!domain) {
    return { title: null, description: null, imageUrl: null, siteName: null };
  }

  // The timeout stays armed until the body read finishes (cleared in the
  // finally below): a server that sends headers promptly then stalls the
  // body mid-stream is aborted instead of hanging the link save forever.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "LinkBreeze/1.0 (link preview fetcher)",
        Accept: "text/html",
      },
    });

    if (!res.ok) {
      return { title: null, description: null, imageUrl: null, siteName: null };
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return { title: null, description: null, imageUrl: null, siteName: null };
    }

    // Read only the first 512KB — OG tags are in <head>.
    const reader = res.body?.getReader();
    if (!reader) {
      return { title: null, description: null, imageUrl: null, siteName: null };
    }

    let html = "";
    let totalBytes = 0;
    const decoder = new TextDecoder();

    while (totalBytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
      // Stop early once we have </head>
      if (html.includes("</head>")) break;
    }
    html += decoder.decode(); // flush

    const og = parseOgTags(html);

    // Cache the OG image locally if present.
    if (og.imageUrl) {
      const localImage = await cacheOgImage(og.imageUrl, url);
      og.imageUrl = localImage;
    }

    return og;
  } catch {
    return { title: null, description: null, imageUrl: null, siteName: null };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse og: meta tags from HTML string.
 * Also falls back to twitter: meta tags and standard <title>/<meta description>.
 */
function parseOgTags(html: string): OgData {
  const getMeta = (property: string): string | null => {
    // Match <meta property="og:..." content="..."> and <meta name="twitter:..." content="...">
    const regex = new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
      "i",
    );
    const match = html.match(regex);
    return match ? decodeEntities(match[1]).trim() : null;
  };

  // Also try reversed order: content before property
  const getMetaReversed = (property: string): string | null => {
    const regex = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
      "i",
    );
    const match = html.match(regex);
    return match ? decodeEntities(match[1]).trim() : null;
  };

  const meta = (p: string): string | null => getMeta(p) ?? getMetaReversed(p);

  const title =
    meta("og:title") ||
    meta("twitter:title") ||
    extractTag(html, "title") ||
    null;

  const description =
    meta("og:description") ||
    meta("twitter:description") ||
    getMetaContent(html, "description") ||
    null;

  const imageUrl =
    meta("og:image") || meta("og:image:url") || meta("twitter:image") || null;

  const siteName = meta("og:site_name") || null;

  return { title, description, imageUrl, siteName };
}

function getMetaContent(html: string, name: string): string | null {
  const regex = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const match = html.match(regex);
  return match ? match[1].trim() : null;
}

function extractTag(html: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = html.match(regex);
  return match ? match[1].trim() : null;
}

function decodeEntities(s: string): string {
  // Single pass: chained .replace() calls would double-unescape sequences
  // like "&amp;lt;" (→ "&lt;" → "<"). One regex sweep over the original
  // string avoids re-matching produced output.
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => {
    switch (e) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      default:
        return "'";
    }
  });
}

/**
 * Download and cache an OG image locally.
 * Returns the local URL path or null if download failed.
 */
async function cacheOgImage(
  imageUrl: string,
  sourceUrl: string,
): Promise<string | null> {
  // Resolve relative image URLs against the source page.
  let absoluteUrl = imageUrl;
  if (imageUrl.startsWith("//")) {
    absoluteUrl = `https:${imageUrl}`;
  } else if (imageUrl.startsWith("/")) {
    try {
      const origin = new URL(sourceUrl).origin;
      absoluteUrl = `${origin}${imageUrl}`;
    } catch {
      return null;
    }
  }

  if (!absoluteUrl.startsWith("http://") && !absoluteUrl.startsWith("https://")) {
    return null;
  }

  const hash = crypto
    .createHash("sha256")
    .update(absoluteUrl)
    .digest("hex")
    .slice(0, 16);

  await ensureUploadsDir();

  // Detect extension from URL, default to .jpg
  let ext = ".jpg";
  const urlPath = new URL(absoluteUrl).pathname;
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
    const res = await fetch(absoluteUrl, {
      signal: controller.signal,
      redirect: "follow",
    });

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
