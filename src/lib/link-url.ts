const ALLOWED_SCHEMES_BY_TYPE: Record<string, Set<string>> = {
  url: new Set(["http:", "https:"]),
  email: new Set(["mailto:"]),
  phone: new Set(["tel:"]),
  whatsapp: new Set(["https:", "whatsapp:"]),
  sms: new Set(["sms:"]),
  vcard: new Set(["https:", "http:"]),
  file: new Set(["/", "https:", "http:"]),
  embed: new Set(["https:"]),
  text: new Set(["http:", "https:"]),
  location: new Set(["https:"]),
  // #87 divider elements carry no target — the column just holds "" (or a
  // legacy value from a converted link). Only the empty string is valid so
  // a restored backup can never smuggle a live URL in through a divider.
  divider: new Set<string>([]),
};

/** Hosts that serve genuine Google Maps pages (any path under /maps). */
const GOOGLE_MAPS_HOSTS = new Set([
  "www.google.com",
  "google.com",
  "maps.google.com",
  "www.maps.google.com",
]);

/** Google Maps short-link hosts (mobile "Share" button). Resolved at save. */
const MAPS_SHORT_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "g.co",
  "www.g.co",
]);

/**
 * #93 location cards: resolve whatever the operator pasted into a canonical
 * Google Maps URL. Full Google Maps URLs (www / bare / maps.google.com,
 * http upgraded to https) pass through so pasted links keep their exact
 * pin/coordinates; short share links pass through too (they are followed
 * server-side at save time — see resolvePopupFields). Anything else is
 * treated as a place query and encoded. The result is always an https
 * Google URL, safe to 302 to from /go/:id.
 */
export function buildMapsUrl(place: string): string {
  const trimmed = place.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    if (MAPS_SHORT_HOSTS.has(host)) return trimmed;
    if (
      GOOGLE_MAPS_HOSTS.has(host) &&
      (u.pathname === "/" || u.pathname.startsWith("/maps"))
    ) {
      u.protocol = "https:";
      return u.toString();
    }
  } catch {
    // Not a parseable absolute URL — fall through, treat as a place query.
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}

/** Is this a Google Maps short link that should be followed at save time? */
export function isMapsShortLink(url: string): boolean {
  try {
    return MAPS_SHORT_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function safeDecode(s: string): string {
  // Paths use "+" for spaces (query-string convention); decodeURIComponent
  // alone would leave literal "+". Convert first, then decode percents.
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

/**
 * #93 location cards: build the keyless embed iframe src for the stored
 * Maps URL. Handles every URL shape Google actually emits:
 *   ?query= / ?q= params, /maps/place/Name/@lat,lng[,zoom], plain /@lat,lng,
 *   and /maps/search/Name or /maps/place/Name paths without coords.
 * Coordinates win over names (exact pin, no search ambiguity) and the
 * original zoom rides along when present. Only invoked when the dialog
 * opens (lazy), so no third-party contact happens until then.
 */
export function mapEmbedSrc(mapsUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(mapsUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  // /@lat,lng[,zoom] in the path — the exact pin.
  const m = u.pathname.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)(?:,(\d{1,2})z)?/);
  if (m) {
    const z = m[3] ? `&z=${m[3]}` : "";
    return `https://maps.google.com/maps?q=${m[1]},${m[2]}${z}&output=embed`;
  }

  // Search-style query params (our own constructed URLs use ?query=).
  const qParam = u.searchParams.get("query") ?? u.searchParams.get("q");
  if (qParam) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(qParam)}&output=embed`;
  }

  // /maps/search/Name or /maps/place/Name without coordinates.
  const pathMatch = u.pathname.match(/\/maps\/(?:search|place)\/([^/?]+)/);
  if (pathMatch) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(safeDecode(pathMatch[1]))}&output=embed`;
  }
  return null;
}

export function isAllowedLinkUrl(type: string, value: string): boolean {
  const trimmed = value.trim();
  const allowedSchemes = ALLOWED_SCHEMES_BY_TYPE[type];
  if (!allowedSchemes) return false;

  // Text popups may omit the URL entirely (no CTA button).
  if (type === "text" && trimmed === "") return true;

  // vCard links always point at the page's own /api/vcard/<slug> route —
  // the URL column stays empty and the href is resolved at render time.
  if (type === "vcard") return trimmed === "";

  // #87 divider elements carry no URL at all — an empty string is the only
  // valid value (the "divider" allowlist is empty by design).
  if (type === "divider") return trimmed === "";

  if (trimmed.startsWith("/")) {
    return allowedSchemes.has("/") && !trimmed.startsWith("//");
  }

  try {
    const url = new URL(trimmed);
    if (type === "whatsapp" && url.protocol === "https:") {
      return url.hostname === "wa.me";
    }
    // Location cards only ever point at Google Maps (the CTA is directions).
    if (type === "location" && url.protocol === "https:") {
      return url.hostname === "www.google.com" || url.hostname === "maps.google.com";
    }
    return allowedSchemes.has(url.protocol);
  } catch {
    return false;
  }
}
