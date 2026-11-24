import { revealAnimationStyle, type ThemeInput } from "@/lib/theme-tokens";
import { parseGithubRepoUrl, resolveEmbedFrame, type EmbedFrame } from "@/lib/embed-providers";
import { fetchGithubRepoInfo, type GithubRepoInfo } from "@/lib/github-repo-card";
import { buildEmbedModalHtml } from "@/components/public/build-embed-modal";

interface EmbedWidgetProps {
  url: string;
  title: string;
  /** Unique link id — names the modal <dialog> and keys the open beacon. */
  linkId: number;
  index: number;
  animationType: string;
  theme?: ThemeInput;
  /** Extra entrance delay (ms) — used to continue the stagger across sections. */
  baseDelayMs?: number;
  /**
   * Hostname the visitor's browser sees (x-forwarded-host/host). Only Twitch
   * needs it: its player refuses to load unless `parent` names the embedding
   * host, and on LinkBreeze that host varies per page (custom domains).
   */
  requestHost?: string;
}

/**
 * Embed link renderer — public pages, Server Component, no client JS.
 *
 * Three outcomes for a stored embed URL:
 *  1. github.com/<owner>/<repo>  → server-rendered repo card (API + cache)
 *  2. a known iframe provider    → lazy sandboxed iframe (embed-providers.ts)
 *  3. anything else              → plain themed link card — an embed URL the
 *     registry doesn't know must still show visitors something clickable,
 *     never silently vanish (that was the old behavior).
 *
 * All three share the same themed frame (glass / gel / pixel) so new
 * providers inherit every theme without per-provider styling.
 */

function PixelFrame({
  reveal,
  delay,
  children,
}: {
  reveal: string;
  delay: string | undefined;
  children: React.ReactNode;
}) {
  // Pixel clip-paths
  const pixelOuterClip = "polygon(8px 0,calc(100% - 8px) 0,calc(100% - 8px) 4px,calc(100% - 4px) 4px,calc(100% - 4px) 8px,100% 8px,100% calc(100% - 8px),calc(100% - 4px) calc(100% - 8px),calc(100% - 4px) calc(100% - 4px),calc(100% - 8px) calc(100% - 4px),calc(100% - 8px) 100%,8px 100%,8px calc(100% - 4px),4px calc(100% - 4px),4px calc(100% - 8px),0 calc(100% - 8px),0 8px,4px 8px,4px 4px)";
  const pixelInnerClip = "polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 3px) calc(100% - 6px),calc(100% - 3px) calc(100% - 3px),calc(100% - 6px) calc(100% - 3px),calc(100% - 6px) 100%,6px 100%,6px calc(100% - 3px),3px calc(100% - 3px),3px calc(100% - 6px),0 calc(100% - 6px),0 6px,3px 6px,3px 3px)";
  return (
    <div
      className="lb-pixel-embed-wrap"
      style={{
        position: "relative",
        margin: "0 0 var(--lb-spacing)",
        animation: reveal || undefined,
        animationDelay: delay,
        clipPath: pixelOuterClip,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--lb-accent)",
          clipPath: pixelOuterClip,
        }}
      />
      <div
        style={{
          position: "relative",
          margin: "3px",
          background: "var(--lb-card-bg)",
          clipPath: pixelInnerClip,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export async function EmbedWidget({
  url,
  title,
  linkId,
  index,
  animationType,
  theme,
  baseDelayMs = 0,
  requestHost,
}: EmbedWidgetProps) {
  const isPixel = theme?.linkStyle === "pixel";
  const isGel = theme?.linkStyle === "gel";

  const revealStyle = revealAnimationStyle(animationType, baseDelayMs + index * 60);
  const reveal = revealStyle?.animation ?? "";
  const delay = revealStyle ? revealStyle.animationDelay : undefined;

  // ── Resolve: GitHub card → iframe provider → plain fallback ──────────
  const gh = parseGithubRepoUrl(url);
  const repo = gh ? await fetchGithubRepoInfo(gh.owner, gh.repo) : null;
  const embed = repo ? null : resolveEmbedFrame(url, { twitchParent: requestHost });

  let content: React.ReactNode;

  if (repo) {
    content = <GithubRepoCardContent info={repo} title={title} />;
  } else if (embed && embed.mode === "modal") {
    // Click-to-open providers (TikTok portrait, Cal.com, Forms, Tally):
    // themed preview tile + native <dialog>, iframe attached lazily on
    // open — the same zero-JS pattern as the #93 location popups.
    content = (
      <div
        // The tile + dialog carry inline onclick handlers (the popup-card
        // contract); React server components cannot express them as props.
        dangerouslySetInnerHTML={{ __html: buildEmbedModalHtml(embed, title, linkId) }}
      />
    );
  } else if (embed) {
    content = <EmbedFrameContent embed={embed} title={title} />;
  } else {
    // Unknown provider (or Twitch without a usable parent host): degrade to
    // a plain clickable card so the link stays visible and useful.
    content = <FallbackCardContent url={url} title={title} />;
  }

  if (isPixel) {
    return (
      <PixelFrame reveal={reveal} delay={delay}>
        {content}
      </PixelFrame>
    );
  }

  return (
    <div
      className={`overflow-hidden${isGel ? " lb-gel-embed" : ""}`}
      style={{
        animation: reveal || undefined,
        animationDelay: delay,
        background: "var(--lb-card-bg)",
        border: "var(--lb-border-width) solid var(--lb-card-border)",
        borderRadius: "var(--lb-media-radius)",
        backdropFilter: "blur(var(--lb-blur))",
        WebkitBackdropFilter: "blur(var(--lb-blur))",
        margin: "0 0 var(--lb-spacing)",
      }}
    >
      {content}
    </div>
  );
}

/** Caption shared by providers whose player UI has no title of its own. */
function Caption({ title }: { title: string }) {
  return (
    <p
      style={{
        padding: "var(--lb-btn-padding-y) var(--lb-btn-padding-x)",
        margin: 0,
        fontSize: "calc(var(--lb-font-size) - 1px)",
        opacity: 0.7,
        color: "var(--lb-text)",
      }}
    >
      {title}
    </p>
  );
}

function EmbedFrameContent({ embed, title }: { embed: EmbedFrame; title: string }) {
  const isFixed = embed.aspect !== "auto";
  return (
    <>
      {isFixed ? (
        // Aspect-driven frames (video players): width fills the card, height
        // follows the intrinsic ratio — no wrapper, no hardcoded 56.25%.
        <iframe
          src={embed.src}
          title={title}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{
            width: "100%",
            aspectRatio: embed.aspect,
            height: "auto",
            border: 0,
            display: "block",
          }}
        />
      ) : (
        <iframe
          src={embed.src}
          title={title}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          allow="autoplay"
          style={{ width: "100%", height: `${embed.height}px`, border: 0, display: "block" }}
        />
      )}
      {embed.caption ? <Caption title={title} /> : null}
    </>
  );
}

const CARD_LINK_STYLE: React.CSSProperties = {
  display: "block",
  padding: "var(--lb-btn-padding-y) var(--lb-btn-padding-x)",
  textDecoration: "none",
  color: "inherit",
};

/** Server-rendered repo card for github.com links — no iframe, no API key. */
function GithubRepoCardContent({ info, title }: { info: GithubRepoInfo; title: string }) {
  const meta: string[] = [
    `★ ${info.stars.toLocaleString("en-US")}`,
    `⑂ ${info.forks.toLocaleString("en-US")}`,
  ];
  if (info.language) meta.push(info.language);
  return (
    <a href={info.htmlUrl} target="_blank" rel="noopener noreferrer nofollow" style={CARD_LINK_STYLE}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "calc(var(--lb-btn-padding-x) / 2)",
          color: "var(--lb-text)",
        }}
      >
        {info.ownerAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote user-data avatar, not an optimizable local asset
          <img
            src={info.ownerAvatarUrl}
            alt=""
            width={20}
            height={20}
            style={{ borderRadius: "50%", flex: "0 0 auto" }}
          />
        ) : null}
        <span style={{ fontWeight: 600, color: "var(--lb-accent)" }}>{info.fullName}</span>
      </div>
      <p
        style={{
          margin: "calc(var(--lb-btn-padding-y) / 2) 0 0",
          fontSize: "calc(var(--lb-font-size) - 1px)",
          color: "var(--lb-text)",
        }}
      >
        {info.description ?? title}
      </p>
      <div
        style={{
          display: "flex",
          gap: "calc(var(--lb-btn-padding-x) * 0.75)",
          marginTop: "calc(var(--lb-btn-padding-y) / 2)",
          fontSize: "calc(var(--lb-font-size) - 2px)",
          opacity: 0.7,
          color: "var(--lb-text)",
        }}
      >
        {meta.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </a>
  );
}

/** Plain clickable card — unknown embed URLs degrade to this, never vanish.
 *  The href is a stored value: only https survives into an anchor (the write
 *  boundary enforces this for embed links; this guards legacy/restored rows). */
function FallbackCardContent({ url, title }: { url: string; title: string }) {
  let host = url;
  let clickable = false;
  try {
    const u = new URL(url);
    clickable = u.protocol === "https:";
    host = u.hostname.replace(/^www\./, "");
  } catch {
    /* stored URLs are validated at save time; keep the raw string */
  }
  return (
    <a
      href={clickable ? url : undefined}
      target="_blank"
      rel="noopener noreferrer nofollow"
      style={{ ...CARD_LINK_STYLE, cursor: clickable ? "pointer" : "default" }}
    >
      <span style={{ fontWeight: 600, color: "var(--lb-text)" }}>{title}</span>
      <span
        style={{
          display: "block",
          marginTop: "calc(var(--lb-btn-padding-y) / 2)",
          fontSize: "calc(var(--lb-font-size) - 2px)",
          opacity: 0.6,
          color: "var(--lb-text)",
        }}
      >
        {host}
      </span>
    </a>
  );
}
