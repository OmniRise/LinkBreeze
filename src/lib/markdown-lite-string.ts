/**
 * String port of MarkdownLite (#93 popup cards).
 *
 * Renders the same controlled subset as the React version used for privacy
 * pages — # / ## headings, - lists, 1. ordered lists, --- dividers,
 * paragraphs, **bold**, *italic*, `code`, [text](url) links — but to an
 * HTML string, because public link cards are emitted as raw HTML
 * via dangerouslySetInnerHTML (zero client JS architecture).
 *
 * Safety: every line is HTML-escaped FIRST; the only tags in the output are
 * the ones this renderer emits. Link hrefs additionally pass a scheme check —
 * only http(s) URLs become anchors, everything else renders as plain text
 * (the content is already escaped, so `javascript:` payloads can never reach
 * an href attribute). Headings render as styled <p> (bold text), not real
 * h1/h2 — the public page's heading outline belongs to the profile.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Inline markers, link-first so `[text](url)` wins over the plain markers
 * inside it. URLs must contain no whitespace or closing paren (controlled
 * subset — same constraint as the React renderer).
 */
const INLINE_RE = /(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

/** Only http(s) hrefs are emitted; anything else renders as plain text. */
function isSafeHref(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url);
}

function renderMarkers(text: string): string {
  return text
    .split(INLINE_RE)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return `<strong>${part.slice(2, -2)}</strong>`;
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return `<em>${part.slice(1, -1)}</em>`;
      }
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return `<code>${part.slice(1, -1)}</code>`;
      }
      return part;
    })
    .join("");
}

function renderInline(text: string): string {
  return text
    .split(INLINE_RE)
    .filter(Boolean)
    .map((part) => {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
      if (link) {
        const [, label, rawUrl] = link;
        // Already HTML-escaped upstream, so an http(s) URL is safe verbatim;
        // non-http(s) "URLs" fall back to the literal bracket text.
        if (isSafeHref(rawUrl)) {
          return `<a class="lb-md-link" href="${rawUrl}" target="_blank" rel="noopener noreferrer nofollow">${renderMarkers(label)}</a>`;
        }
        return part;
      }
      return renderMarkers(part);
    })
    .join("");
}

export function renderMarkdownLiteString(content: string): string {
  const lines = esc(content).split(/\r?\n/);
  const out: string[] = [];
  let listOpen: false | "ul" | "ol" = false;

  const closeList = () => {
    if (listOpen) {
      out.push(`</${listOpen}>`);
      listOpen = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      closeList();
      continue;
    }

    if (line === "---") {
      closeList();
      out.push('<hr class="lb-md-hr" />');
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      out.push(`<p class="lb-md-h2">${renderInline(line.slice(3))}</p>`);
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      out.push(`<p class="lb-md-h1">${renderInline(line.slice(2))}</p>`);
      continue;
    }
    const ordered = /^\d+\. (.+)$/.exec(line);
    if (ordered) {
      if (listOpen !== "ol") {
        closeList();
        out.push('<ol class="lb-md-list lb-md-ol">');
        listOpen = "ol";
      }
      out.push(`<li>${renderInline(ordered[1])}</li>`);
      continue;
    }
    if (line.startsWith("- ")) {
      if (listOpen !== "ul") {
        closeList();
        out.push('<ul class="lb-md-list">');
        listOpen = "ul";
      }
      out.push(`<li>${renderInline(line.slice(2))}</li>`);
      continue;
    }

    closeList();
    out.push(`<p class="lb-md-p">${renderInline(line)}</p>`);
  }

  closeList();
  return out.join("\n");
}
