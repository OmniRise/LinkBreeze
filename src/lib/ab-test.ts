import { z } from "zod";

/**
 * #81 A/B testing for links — pure core.
 *
 * Storage: links.ab_config (JSON text, NULL = no test). Variant A is the
 * link row's own `url`; the config carries variant B's destination, labels,
 * integer weights, lifecycle status and the promoted winner. Per-click
 * attribution lives in analytics_clicks.variant ('A' | 'B' | NULL).
 *
 * Everything here is pure and fixture-testable — no DB imports, safe for
 * client bundles (the link dialog reuses the schema + helpers).
 */

export type AbStatus = "running" | "paused" | "archived";
export type AbVariant = "A" | "B";

export const abConfigSchema = z
  .object({
    v: z.literal(1),
    status: z.enum(["running", "paused", "archived"]),
    labelA: z.string().max(60).nullable(),
    labelB: z.string().max(60).nullable(),
    urlB: z.string().min(1).max(500),
    weightA: z.number().int().min(1).max(99),
    weightB: z.number().int().min(1).max(99),
    winner: z.enum(["A", "B"]).nullable(),
  })
  .refine((c) => c.weightA + c.weightB === 100, {
    message: "A/B weights must sum to 100",
  });

export type AbConfig = z.infer<typeof abConfigSchema>;

/**
 * Parse a stored ab_config string. Malformed/tampered JSON degrades to
 * NULL (no test) — restore and serving never crash on a bad config.
 */
export function parseAbConfig(raw: string | null): AbConfig | null {
  if (!raw) return null;
  try {
    const parsed = abConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Serialize for storage. */
export function serializeAbConfig(config: AbConfig): string {
  return JSON.stringify(config);
}

/** Does this config currently split traffic? Only "running" serves B. */
export function isAbActive(config: AbConfig | null): config is AbConfig {
  return config !== null && config.status === "running";
}

/** FNV-1a 32-bit — deterministic, dependency-free, even avalanche. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * murmur3 fmix32 finalizer — breaks the structural correlation FNV-1a keeps
 * between inputs that differ only in their last characters (sequential link
 * ids appended to the same visitor hash). Without this, bucket i on link 1
 * and bucket i on link 2 are measurably correlated (observed 35% same-variant
 * instead of 50% on sequential ids); with it, assignments across links are
 * independent. Pure bit-mixing, no state.
 */
export function fmix32(h: number): number {
  h = h >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Deterministic visitor→variant assignment (#81).
 *
 * The bucket is FNV-1a(visitorHash:linkId) mod 100 compared against weightA.
 * No client state involved: a visitor can neither pick a variant nor skew the
 * split — stickiness (same visitor, same link, same variant across visits)
 * falls out of hashing the existing server-side visitor hash. Per-link salt
 * via linkId means assignments are independent across links.
 */
export function assignVariant(
  visitorHash: string,
  linkId: number,
  weightA: number,
  weightB: number,
): AbVariant {
  // Defensive: weights that fail validation (e.g. hand-edited DB) fall back
  // to an even split rather than collapsing to one variant.
  const total = weightA + weightB;
  const usableA =
    weightA >= 1 && weightB >= 1 && total === 100 ? weightA : 50;
  const bucket = fmix32(fnv1a32(`${visitorHash}:${linkId}`)) % 100;
  return bucket < usableA ? "A" : "B";
}

/** Pick the serving target for a running test. A = the link's own url. */
export function resolveVariantUrl(
  config: AbConfig,
  variant: AbVariant,
  urlA: string,
): string {
  return variant === "B" ? config.urlB : urlA;
}

/** Lift of B over A as a percentage. null when A has no clicks yet. */
export function variantLift(clicksA: number, clicksB: number): number | null {
  if (clicksA <= 0) return null;
  return ((clicksB - clicksA) / clicksA) * 100;
}

/**
 * Honest confidence hint (#81: "no fake winner calls at 12 clicks").
 *
 * Binomial goodness-of-fit: under H0 the split follows the configured
 * weights, so z = (observedA/n - wA/100) / sqrt(p(1-p)/n). Returns the
 * leading variant and whether the margin is statistically significant
 * (|z| >= 1.96, ~95%). A small total sample (< minSample) is NEVER
 * significant regardless of z.
 */
export function variantConfidence(
  clicksA: number,
  clicksB: number,
  weightA = 50,
  minSample = 100,
): { leader: AbVariant | null; significant: boolean } {
  const n = clicksA + clicksB;
  if (n === 0) return { leader: null, significant: false };
  const leader: AbVariant | null = clicksA === clicksB ? null : clicksA > clicksB ? "A" : "B";
  if (n < minSample) return { leader, significant: false };
  const p = Math.min(Math.max(weightA, 1), 99) / 100; // expected A share
  const se = Math.sqrt((p * (1 - p)) / n) || 1e-12;
  const z = Math.abs(clicksA / n - p) / se;
  return { leader, significant: z >= 1.96 };
}
