/**
 * Embed provider registry — pure URL → embed-descriptor matching.
 *
 * Single source of truth for every embeddable link type (the widget renders
 * what this returns; nothing else in the codebase pattern-matches provider
 * hosts). Keep it pure: no fetch, no React, no headers() — Twitch's `parent`
 * arrives as an argument so tests don't need request context.
 *
 * Providers: youtube, spotify, vimeo, soundcloud, bandcamp, dailymotion,
 * twitch, rumble. GitHub repo URLs are NOT frames — they resolve through
 * parseGithubRepoUrl() + the server-side repo card (see github-repo-card.ts).
 */

import { mapEmbedSrc } from "@/lib/link-url";

export interface EmbedFrame {
  src: string;
  /** CSS aspect-ratio value, or "auto" for fixed-height players. */
  aspect: string;
  provider: string;
  /** Pixel height when aspect is "auto"; 0 when the frame is aspect-driven. */
  height: number;
  /** Players without their own title UI get a caption under the frame. */
  caption: boolean;
  /**
   * "inline" (default): iframe renders directly in the page card.
   * "modal": the card shows a themed preview tile; tapping opens a native
   * <dialog> with the iframe — for providers whose content is tall
   * (booking calendars, forms) or portrait (TikTok 9:16), where an inline
   * frame would break the page rhythm. Lazy: no third-party contact until
   * the visitor taps.
   */
  mode?: "inline" | "modal";
  /** Human provider name shown on modal preview tiles ("Cal.com booking"). */
  label?: string;
  /** Lucide icon name for the modal preview tile ("calendar"). */
  icon?: string;
}

/** Twitch player/clips embeds refuse to run unless `parent` is the page host. */
export interface EmbedResolveOptions {
  /** Hostname the visitor's browser sees (x-forwarded-host/host, normalized). */
  twitchParent?: string;
}

const PATH_SAFE = /^[A-Za-z0-9_.-]+$/;

/** First path segment, or "" — most providers key off it. */
function firstSegment(u: URL): string {
  return u.pathname.split("/").filter(Boolean)[0] ?? "";
}

function frame(src: string, provider: string, opts?: Partial<EmbedFrame>): EmbedFrame {
  return { src, aspect: "16 / 9", height: 0, caption: false, provider, ...opts };
}

/**
 * github.com/<owner>/<repo> — including deep paths (blob, issues, pulls),
 * which still point at the same repo card. Returns null for single-segment
 * URLs, reserved roots (topics, orgs, features, …), non-github hosts and
 * malformed input, so only real repositories reach the repo-card fetch.
 */
export function parseGithubRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "github.com") return null;
    const seg = u.pathname.split("/").filter(Boolean);
    if (seg.length < 2) return null;
    const [owner, rawRepo] = seg;
    if (!PATH_SAFE.test(owner) || !PATH_SAFE.test(rawRepo)) return null;
    // Reserved first segments are site pages, not orgs — never treat as repos.
    const RESERVED = new Set([
      "features", "topics", "collections", "trending", "marketplace", "sponsors",
      "orgs", "settings", "explore", "apps", "about", "pricing", "security",
      "enterprise", "customers", "events", "education", "team", "business",
      "nonprofit", "site", "status", "support", "blog", "community", "developer",
      "docs", "media", "services", "api", "training", "partners", "readme",
      "codespaces", "advisories", "dependabot", "discussions", "gists", "issues",
      "notifications", "new", "pulls", "search", "watch", "login", "logout",
      "join", "home", "collections",
    ]);
    if (RESERVED.has(owner.toLowerCase())) return null;
    return { owner, repo: rawRepo.replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

/**
 * Resolve an embed URL to an iframe descriptor, or null when the URL does
 * not match a known provider (the widget then renders a plain fallback card
 * so the link never silently disappears).
 */
export function resolveEmbedFrame(
  url: string,
  opts: EmbedResolveOptions = {},
): EmbedFrame | null {
  try {
    const u = new URL(url);
    // Defense-in-depth at render: the write boundary (linkSchema →
    // isAllowedLinkUrl) already restricts embed links to https:, but restored
    // backups or legacy rows never re-validate. An http/javascript src in an
    // iframe is never acceptable.
    if (u.protocol !== "https:") return null;
    const host = u.hostname.replace(/^www\./, "");

    // YouTube — watch?v=, youtu.be/, /embed/, /shorts/. The id lands inside
    // the iframe src template, so it must be plain token characters.
    const VIDEO_ID_SAFE = /^[A-Za-z0-9_-]{6,}$/;
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const videoId =
        u.searchParams.get("v") ||
        u.pathname.split("/").filter(Boolean).slice(-1)[0];
      if (videoId && VIDEO_ID_SAFE.test(videoId)) {
        return frame(`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`, "youtube");
      }
      return null;
    }
    if (host === "youtu.be") {
      const videoId = firstSegment(u);
      if (videoId && VIDEO_ID_SAFE.test(videoId)) {
        return frame(`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`, "youtube");
      }
      return null;
    }

    // Spotify — track, episode, playlist, album. Fixed height (not 16:9) —
    // Spotify's player is 152px tall regardless of width. Strips /embed/.
    if (host === "spotify.com" || host === "open.spotify.com") {
      const cleanPath = u.pathname.replace(/^\/embed/, "");
      return frame(`https://open.spotify.com/embed${cleanPath}`, "spotify", {
        aspect: "auto",
        height: 152,
      });
    }

    // Vimeo — numeric ids only (the id lands in the iframe src template).
    if (host === "vimeo.com") {
      const videoId = firstSegment(u);
      if (videoId && /^\d{5,12}$/.test(videoId)) {
        return frame(`https://player.vimeo.com/video/${videoId}`, "vimeo");
      }
      return null;
    }

    // SoundCloud
    if (host === "soundcloud.com") {
      return frame(
        `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ff5500&auto_play=false`,
        "soundcloud",
        { aspect: "auto", height: 166, caption: true },
      );
    }

    // Bandcamp
    if (host === "bandcamp.com") {
      const albumId = u.searchParams.get("album_id") || "";
      if (albumId) {
        return frame(
          `https://bandcamp.com/EmbeddedPlayer/album=${albumId}/size=large/bgcol=ffffff/linkcol=0687f5/transparent=true/`,
          "bandcamp",
          { aspect: "auto", height: 350, caption: true },
        );
      }
      return null;
    }

    // Dailymotion — /video/<id>, /embed/video/<id>, dai.ly/<id>
    if (host === "dailymotion.com" || host === "dai.ly") {
      const seg = u.pathname.split("/").filter(Boolean);
      const videoId =
        host === "dai.ly"
          ? firstSegment(u)
          : seg[0] === "embed" && seg[1] === "video"
            ? seg[2]
            : seg[0] === "video"
              ? seg[1]
              : null;
      if (videoId && PATH_SAFE.test(videoId)) {
        return frame(`https://www.dailymotion.com/embed/video/${videoId}?autoplay=0`, "dailymotion");
      }
      return null;
    }

    // Twitch — every player URL must carry parent=<page host> or Twitch
    // refuses to load, so without requestHost we cannot build a working
    // frame (the widget falls back to a plain card instead).
    if (host === "twitch.tv" || host === "clips.twitch.tv" || host === "player.twitch.tv") {
      const parent = opts.twitchParent;
      if (!parent) return null;
      if (host === "clips.twitch.tv") {
        const slug = firstSegment(u);
        if (slug && PATH_SAFE.test(slug)) {
          return frame(`https://clips.twitch.tv/embed?clip=${slug}&parent=${parent}`, "twitch");
        }
        return null;
      }
      const seg = u.pathname.split("/").filter(Boolean);
      if (seg[0] === "videos" && seg[1] && PATH_SAFE.test(seg[1])) {
        return frame(`https://player.twitch.tv/?video=${seg[1]}&parent=${parent}&autoplay=false`, "twitch");
      }
      // <channel>/clip/<slug> is a clip URL, not a channel URL — check the
      // clip marker BEFORE the channel fallback below.
      if (seg[1] === "clip" && seg[2] && PATH_SAFE.test(seg[2])) {
        return frame(`https://clips.twitch.tv/embed?clip=${seg[2]}&parent=${parent}`, "twitch");
      }
      const channel = firstSegment(u);
      if (
        channel &&
        PATH_SAFE.test(channel) &&
        !["videos", "directory", "settings", "downloads", "search", "p", "team", "about"].includes(channel)
      ) {
        return frame(`https://player.twitch.tv/?channel=${channel}&parent=${parent}&autoplay=false`, "twitch");
      }
      return null;
    }

    // Rumble — only embed URLs resolve client-side; watch/share URLs carry a
    // short hash that needs an oEmbed round-trip, out of scope for now.
    if (host === "rumble.com") {
      if (u.pathname.startsWith("/embed/")) {
        return frame(u.toString(), "rumble");
      }
      return null;
    }

    // Odysee — /@channel/video-slug (claim ids add ":<number>" suffixes).
    // Pasted /$/embed/ links normalize to the canonical path. 16:9 inline.
    if (host === "odysee.com") {
      const path = u.pathname
        .replace(/^\/\$\/embed\/?/, "")
        .replace(/^\//, "");
      if (/^@[A-Za-z0-9][A-Za-z0-9._:-]*(\/[A-Za-z0-9][A-Za-z0-9._:-]*)*$/.test(path)) {
        return frame(`https://odysee.com/$/embed/${path}`, "odysee");
      }
      return null;
    }

    // Google Forms — published forms only (viewform URLs). The legacy
    // /forms/d/<ID>/ shape normalizes to the /d/e/ embed form. Modal: forms
    // are long scrollable documents, not 16:9 media.
    if (host === "docs.google.com") {
      const m = u.pathname.match(/^\/forms\/(?:d\/e\/|d\/)([A-Za-z0-9_-]{10,})\/viewform$/);
      if (m) {
        return frame(
          `https://docs.google.com/forms/d/e/${m[1]}/viewform?embedded=true`,
          "gforms",
          { mode: "modal", label: "Google Form", icon: "clipboard-list", aspect: "auto", height: 0 },
        );
      }
      return null;
    }

    // Tally — published forms: /r/<id> (share) or /forms/<id>. Modal, same
    // rationale as Google Forms.
    if (host === "tally.so") {
      const m = u.pathname.match(/^\/(?:r|forms)\/([A-Za-z0-9_-]{3,})$/);
      if (m) {
        return frame(
          `https://tally.so/embed/${m[1]}?alignLeft=1&hideTitle=1&transparentBackground=1`,
          "tally",
          { mode: "modal", label: "Tally form", icon: "list-checks", aspect: "auto", height: 0 },
        );
      }
      return null;
    }

    // Cal.com — booking pages: /<user> or /<user>/<event-type>. Modal (the
    // booking calendar is a tall interactive document). Reserved roots are
    // site pages, never booking users.
    if (host === "cal.com") {
      const segs = u.pathname.split("/").filter(Boolean);
      const CAL_RESERVED = new Set([
        "signup", "login", "logout", "api", "auth", "settings", "docs", "blog",
        "about", "pricing", "privacy", "terms", "teams", "enterprise", "apps",
        "downloads", "help", "security", "careers", "press", "brand", "gifting",
        "booking", "bookings", "availability", "embed", "store",
      ]);
      if (
        segs.length >= 1 &&
        segs.length <= 2 &&
        segs.every((s) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s)) &&
        !CAL_RESERVED.has(segs[0].toLowerCase())
      ) {
        return frame(`https://cal.com/${segs.join("/")}?embed=true`, "calcom", {
          mode: "modal",
          label: "Cal.com booking",
          icon: "calendar",
          aspect: "auto",
          height: 0,
        });
      }
      return null;
    }

    // TikTok — /@user/video/<id> (numeric id only). Portrait 9:16 media:
    // modal, so the dialog can size itself to the viewport without forcing
    // a portrait frame into the page's inline rhythm.
    if (host === "tiktok.com" || host === "m.tiktok.com") {
      const m = u.pathname.match(/^\/@[A-Za-z0-9._]+\/video\/(\d{10,20})$/);
      if (m) {
        return frame(`https://www.tiktok.com/embed/v2/${m[1]}`, "tiktok", {
          mode: "modal",
          label: "TikTok",
          icon: "music-2",
          aspect: "9 / 16",
          height: 0,
        });
      }
      return null;
    }

    // Google Maps — two keyless shapes, both inline 16:9:
    // 1. /maps/embed?pb=<blob> — the blob from Google's "Share → Embed a
    //    map" dialog (charset-checked; it lands inside an iframe src).
    // 2. every other public Maps URL shape (/maps/place/, /@lat,lng/,
    //    /maps/search/, ?q=) delegates to the #93 keyless builder, which
    //    converts them to a q= pin without an API key. Short links
    //    (maps.app.goo.gl) are expanded to their target URL at save time —
    //    the registry only sees resolved URLs.
    if (host === "google.com" || host === "maps.google.com") {
      if (!u.pathname.startsWith("/maps") && !(host === "maps.google.com")) return null;
      if (u.pathname === "/maps/embed") {
        const pb = u.searchParams.get("pb") ?? "";
        if (pb.length >= 50 && /^[A-Za-z0-9!;_.$,%+:@/?=&-]+$/.test(pb)) {
          return frame(`https://www.google.com/maps/embed?pb=${pb}`, "gmaps");
        }
        return null;
      }
      const src = mapEmbedSrc(url);
      if (src) return frame(src, "gmaps");
      return null;
    }

    return null;
  } catch {
    return null;
  }
}
