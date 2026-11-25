import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import { preview, validateUrl } from "linkpeek";
import { UPLOADS_DIR, ensureUploadsDir } from "@/lib/uploads";
import { isForbiddenIp } from "@/lib/private-ip";
import { extractDomain } from "@/lib/favicon";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 512 * 1024; // 512KB — enough for <head>
const MAX_IMAGE_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

export interface OgData {
  title: string | null;
  description: string | null;
  imageUrl: string | null; // local cached path (/api/uploads/og-<hash>.jpg)
  siteName: string | null;
}

const EMPTY: OgData = { title: null, description: null, imageUrl: null, siteName: null };

/**
 * Resolve a hostname and refuse any address that is not publicly routable
 * (security audit CD-2). linkpeek's built-in guard filters hostnames by
 * STRING only unless this resolver is supplied — a DNS name pointing at
 * 169.254.169.254 or an RFC 1918 address would otherwise sail through and
 * get fetched. linkpeek re-checks the RESOLVED addresses (and pins them for
 * the connect), so resolution-time rebinding is covered too.
 *
 * A hostname that does not RESOLVE here is passed through: the fetch itself
 * fails on the same lookup, so there is nothing to guard. The forbidden
 * signal is a successful resolution to a private address.
 */
async function assertPublicHost(hostname: string): Promise<string[]> {
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return []; // unresolvable — fetch will fail identically on its own
  }
  if (addrs.length === 0) return [];
  for (const { address } of addrs) {
    if (isForbiddenIp(address)) throw new Error(`forbidden address ${address}`);
  }
  return addrs.map((a) => a.address);
}

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
      // CD-2: without this, linkpeek filters hostnames by string only and a
      // DNS name resolving into private/metadata space gets fetched.
      resolveHost: assertPublicHost,
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
    // host check as the page fetch — now at the RESOLVED-IP level (CD-2),
    // not just the hostname string.
    let target = imageUrl;
    let res: Response;
    for (let hop = 0; ; hop++) {
      validateUrl(target);
      await assertPublicHost(new URL(target).hostname);
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

    // CD-3: cheap pre-check when the server declares the size...
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > MAX_IMAGE_BYTES) return null;
    // ...and a hard stream cap regardless — content-length can lie or be
    // absent, and buffering an unbounded arrayBuffer() can OOM the instance.
    let buffer = Buffer.alloc(0);
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_IMAGE_BYTES) {
        controller.abort();
        return null;
      }
    }
    if (buffer.length === 0) return null;

    await fs.writeFile(filepath, buffer);
    return `/api/uploads/${filename}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
