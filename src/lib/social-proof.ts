/**
 * Social proof count formatting (roadmap: real numbers, quietly displayed).
 * PURE — fixture-testable. Numeric-only output (no words) so badges need no
 * locale strings.
 */

const COMPACT_AT = 10_000;

const UNITS: Array<[number, string]> = [
  [1_000_000_000, "B"],
  [1_000_000, "M"],
  [1_000, "K"],
];

/**
 * < COMPACT_AT: full grouping ("2,341"). ≥ COMPACT_AT: compact with one
 * decimal, trailing ".0" trimmed ("9.8K", "1.2M"). The full number belongs
 * in the hover title, never the visible text.
 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < COMPACT_AT) return n.toLocaleString("en-US");
  for (const [size, suffix] of UNITS) {
    if (n >= size) {
      const v = n / size;
      const s = v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, "");
      return `${s}${suffix}`;
    }
  }
  return n.toLocaleString("en-US");
}

/** The hover-title text: the exact count, always untruncated. */
export function countTitle(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Badge visibility gate: hidden entirely below the page's configured
 * minimum (0 = always show). Fresh pages/links never display near-zero
 * counts — that is the whole point of the threshold.
 */
export function shouldShowBadge(count: number, min: number): boolean {
  return min <= 0 || count >= min;
}

export type SocialProofMode = "off" | "links" | "page" | "both";

export function isSocialProofMode(v: string): v is SocialProofMode {
  return v === "off" || v === "links" || v === "page" || v === "both";
}

export type SocialProofPlacement = "header" | "footer";

export function isSocialProofPlacement(v: string): v is SocialProofPlacement {
  return v === "header" || v === "footer";
}
