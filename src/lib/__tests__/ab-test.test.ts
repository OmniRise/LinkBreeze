import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseAbConfig,
  serializeAbConfig,
  isAbActive,
  assignVariant,
  resolveVariantUrl,
  variantLift,
  variantConfidence,
  autoPromotableWinner,
  AB_MIN_SAMPLE_CLICKS,
  AB_AUTO_PROMOTE_MIN_CLICKS,
  AB_AUTO_PROMOTE_SETTING,
  fnv1a32,
  abConfigSchema,
  type AbConfig,
} from "@/lib/ab-test";

const base: AbConfig = {
  v: 1,
  status: "running",
  labelA: "control",
  labelB: "short page",
  urlB: "https://example.com/b",
  weightA: 50,
  weightB: 50,
  winner: null,
};

describe("parseAbConfig", () => {
  it("round-trips a valid config", () => {
    expect(parseAbConfig(serializeAbConfig(base))).toEqual(base);
  });

  it("returns null for null / empty", () => {
    expect(parseAbConfig(null)).toBeNull();
    expect(parseAbConfig("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseAbConfig("{not json")).toBeNull();
  });

  it("returns null when weights do not sum to 100", () => {
    const bad = { ...base, weightA: 30, weightB: 30 };
    expect(parseAbConfig(JSON.stringify(bad))).toBeNull();
  });

  it("returns null for out-of-range weights", () => {
    expect(parseAbConfig(JSON.stringify({ ...base, weightA: 0, weightB: 100 }))).toBeNull();
    expect(parseAbConfig(JSON.stringify({ ...base, weightA: 100, weightB: 0 }))).toBeNull();
  });

  it("returns null for non-integer weights (E.40: slider emits ints only, schema must too)", () => {
    // The UI range slider (step=1) can never submit 50.7 — the zod .int()
    // gate is the only thing standing between a hand-crafted payload or a
    // hand-edited DB row and a fractional bucket boundary.
    expect(parseAbConfig(JSON.stringify({ ...base, weightA: 50.7, weightB: 49.3 }))).toBeNull();
    expect(parseAbConfig(JSON.stringify({ ...base, weightA: 50, weightB: 49.5 }))).toBeNull();
  });

  it("returns null for an unknown status", () => {
    expect(parseAbConfig(JSON.stringify({ ...base, status: "live" }))).toBeNull();
  });

  it("returns null for a non-http(s) variant B (E.82 negative parity with the save path)", () => {
    // The schema now enforces the SAME http(s) allowlist that every WRITER
    // enforces (setAbTest, restore sanitizer, manual + auto promote) —
    // a poisoned config can never parse at any layer.
    expect(parseAbConfig(JSON.stringify({ ...base, urlB: "javascript:alert(1)" }))).toBeNull();
    expect(parseAbConfig(JSON.stringify({ ...base, urlB: "data:text/html,x" }))).toBeNull();
    expect(parseAbConfig(JSON.stringify({ ...base, urlB: "ftp://x" }))).toBeNull();
    // Valid https still parses (boundary).
    expect(parseAbConfig(JSON.stringify({ ...base, urlB: "https://example.com/b" }))).not.toBeNull();
  });

  it("returns null for a reversed or unparseable window (E.82 negative parity)", () => {
    expect(
      parseAbConfig(
        JSON.stringify({ ...base, startsAt: "2026-11-08T10:00", endsAt: "2026-11-01T10:00" }),
      ),
    ).toBeNull();
    expect(
      parseAbConfig(JSON.stringify({ ...base, startsAt: "not-a-date", endsAt: "2026-11-08T10:00" })),
    ).toBeNull();
  });

  it("returns null for labels over the 60-char cap (E.82 negative parity)", () => {
    expect(parseAbConfig(JSON.stringify({ ...base, labelA: "x".repeat(61) }))).toBeNull();
    expect(parseAbConfig(JSON.stringify({ ...base, labelB: "y".repeat(61) }))).toBeNull();
    // Boundary still parses.
    expect(parseAbConfig(JSON.stringify({ ...base, labelA: "x".repeat(60) }))).not.toBeNull();
  });
});

describe("isAbActive", () => {
  it("only running configs split traffic", () => {
    expect(isAbActive({ ...base, status: "running" })).toBe(true);
    expect(isAbActive({ ...base, status: "paused" })).toBe(false);
    expect(isAbActive({ ...base, status: "archived" })).toBe(false);
    expect(isAbActive(null)).toBe(false);
  });
});

describe("fnv1a32", () => {
  it("matches known vectors", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });
});

describe("assignVariant", () => {
  it("is sticky: same visitor + link always gets the same variant", () => {
    for (const vh of ["v1", "visitor-42", "abc", "deadbeef"]) {
      const first = assignVariant(vh, 7, 50, 50);
      for (let i = 0; i < 50; i++) {
        expect(assignVariant(vh, 7, 50, 50)).toBe(first);
      }
    }
  });

  it("is per-link: assignments are independent across links", () => {
    // Sequential link ids used to correlate through raw FNV-1a low bits
    // (35% same-variant observed); fmix32 finalizer restores ~50%.
    let sameCount = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      if (
        assignVariant(`v-${i}`, 1, 50, 50) === assignVariant(`v-${i}`, 2, 50, 50)
      ) sameCount++;
    }
    // Binomial sd at n=2000 is ~1.1%; +/-8% is enormously conservative but
    // still catches the 15% deficit the unfixed hash produced.
    expect(sameCount / n).toBeGreaterThan(0.42);
    expect(sameCount / n).toBeLessThan(0.58);
  });

  it("honors weights within tolerance (statistical fixture, 10k visitors)", () => {
    let aCount = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      if (assignVariant(`visitor-${i}`, 1, 70, 30) === "A") aCount++;
    }
    // Expected 7000; +/- 3% absolute is ~4 sigma for n=10k.
    expect(aCount).toBeGreaterThan(6700);
    expect(aCount).toBeLessThan(7300);
  });

  it("degrades a tampered weight pair to an even split", () => {
    // 100/0 and 0/100 are invalid (schema rejects); defensive fallback = 50/50.
    let aCount = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      if (assignVariant(`v-${i}`, 3, 100, 0) === "A") aCount++;
    }
    expect(aCount).toBeGreaterThan(1700);
    expect(aCount).toBeLessThan(2300);
  });

  it("extreme valid weights converge to the configured ratio", () => {
    let aCount = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      if (assignVariant(`w-${i}`, 5, 90, 10) === "A") aCount++;
    }
    expect(aCount).toBeGreaterThan(3400); // ~3600 expected
    expect(aCount).toBeLessThan(3900);
  });

  it("slider boundary weightA=1 still yields BOTH variants (no dead bucket, N=2000)", () => {
    // The slider allows 1/99 — the rarest legal minority. A dead/sticky
    // bucket would give exactly 0 (or exactly all) of one side; fmix32
    // must keep producing the minority in expectation (~20, 3σ = 4.45).
    let aCount = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      if (assignVariant(`bnd-lo-${i}`, 11, 1, 99) === "A") aCount++;
    }
    expect(aCount).toBeGreaterThanOrEqual(6); // minority not starved
    expect(aCount).toBeLessThanOrEqual(60); // majority not universal
  });

  it("slider boundary weightA=99 mirrors the same guarantees (N=2000)", () => {
    let aCount = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      if (assignVariant(`bnd-hi-${i}`, 12, 99, 1) === "A") aCount++;
    }
    // Expected 1980 ± 3σ(4.45) -> [1966, 1994]; B (= n - a) must live.
    expect(aCount).toBeGreaterThanOrEqual(1940);
    expect(aCount).toBeLessThanOrEqual(1994);
    expect(n - aCount).toBeGreaterThanOrEqual(6);
  });

  it("50/50 stays within ±4% absolute at N=2000", () => {
    let aCount = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      if (assignVariant(`bnd-eq-${i}`, 13, 50, 50) === "A") aCount++;
    }
    // sigma = sqrt(2000 * .25) = 22.4; ±80 ≈ 3.6σ.
    expect(aCount).toBeGreaterThanOrEqual(920);
    expect(aCount).toBeLessThanOrEqual(1080);
  });
});

describe("resolveVariantUrl", () => {
  it("A resolves to the link's own url, B to urlB", () => {
    expect(resolveVariantUrl(base, "A", "https://example.com/a")).toBe("https://example.com/a");
    expect(resolveVariantUrl(base, "B", "https://example.com/a")).toBe("https://example.com/b");
  });
});

describe("variantLift", () => {
  it("computes B lift over A", () => {
    expect(variantLift(100, 150)).toBeCloseTo(50);
    expect(variantLift(100, 50)).toBeCloseTo(-50);
    expect(variantLift(100, 100)).toBeCloseTo(0);
  });
  it("returns null when A has no clicks (undefined percentage)", () => {
    expect(variantLift(0, 5)).toBeNull();
    expect(variantLift(0, 0)).toBeNull();
  });

  it("E.115: lift sign is always consistent with the confidence card's leader", () => {
    // The card shows BOTH a leader (variantConfidence, weight-aware) and a
    // lift % (variantLift, raw counts). They must never contradict: B leads
    // ⇔ lift > 0, A leads ⇔ lift < 0, tie ⇔ lift === 0; the documented
    // undefined-percentage cells (A=0) map to B-leads (b>0) or tie (b=0).
    // Lift itself is weight-INDEPENDENT — pinned by running every weight.
    let nonTies = 0;
    let undefinedPct = 0;
    for (const weight of [10, 50, 90]) {
      for (let a = 0; a <= 300; a += 10) {
        for (let b = 0; b <= 300; b += 10) {
          const { leader } = variantConfidence(a, b, weight, AB_MIN_SAMPLE_CLICKS);
          const lift = variantLift(a, b);
          const cell = `w=${weight} a=${a} b=${b}`;
          if (lift === null) {
            undefinedPct++;
            expect(a, cell).toBe(0); // null only when A has no clicks
            expect(leader, cell).toBe(b > 0 ? "B" : null);
          } else if (lift > 0) {
            expect(leader, cell).toBe("B");
            nonTies++;
          } else if (lift < 0) {
            expect(leader, cell).toBe("A");
            nonTies++;
          } else {
            expect(leader, cell).toBeNull(); // exact 0 lift == exact tie
          }
        }
      }
    }
    expect(nonTies).toBeGreaterThan(0); // property not vacuous
    expect(undefinedPct).toBeGreaterThan(0); // A=0 cells reached
  });
});

describe("variantConfidence", () => {
  it("never declares significance below the minimum sample (#81: no fake winner at 12 clicks)", () => {
    expect(variantConfidence(2, 10).significant).toBe(false);
    expect(variantConfidence(1, 98).significant).toBe(false); // n=99 < 100
    expect(variantConfidence(12, 30).significant).toBe(false);
  });

  it("reports a leader even when not significant", () => {
    expect(variantConfidence(2, 10).leader).toBe("B");
    expect(variantConfidence(10, 2).leader).toBe("A");
    expect(variantConfidence(5, 5).leader).toBeNull();
  });

  it("flags a strong split at healthy sample size", () => {
    const r = variantConfidence(350, 650); // 35% vs 65%, n=1000
    expect(r.leader).toBe("B");
    expect(r.significant).toBe(true);
  });

  it("does not flag a noise-level split", () => {
    const r = variantConfidence(510, 490); // n=1000, ~2% off
    expect(r.significant).toBe(false);
  });

  it("honors a non-50/50 expected split", () => {
    // 70/30 weights; observed 700/300 = exactly on target -> not significant
    const onTarget = variantConfidence(700, 300, 70);
    expect(onTarget.significant).toBe(false);
    // observed 500/500 with 70% expected on A -> highly significant
    const skewed = variantConfidence(500, 500, 70);
    expect(skewed.significant).toBe(true);
  });

  it("handles the zero-click case", () => {
    expect(variantConfidence(0, 0)).toEqual({ leader: null, significant: false });
  });
});

describe("autoPromotableWinner (#81 E.1)", () => {
  it("promotes a clear winner at healthy sample size", () => {
    expect(autoPromotableWinner(350, 650, 50)).toBe("B");
    expect(autoPromotableWinner(650, 350, 50)).toBe("A");
  });

  it("never promotes below the minimum sample", () => {
    expect(autoPromotableWinner(2, 18, 50)).toBeNull(); // 20 total < 200
    expect(autoPromotableWinner(1, 99, 50, 200)).toBeNull();
  });

  it("never promotes a noise-level split", () => {
    expect(autoPromotableWinner(510, 490, 50)).toBeNull();
  });

  it("never promotes a tie", () => {
    expect(autoPromotableWinner(100, 100, 50)).toBeNull();
  });

  it("respects the configured weights (70/30 on-target split is not promotable)", () => {
    expect(autoPromotableWinner(700, 300, 70)).toBeNull();
    // But a genuine reversal is: B ahead when A was expected to dominate.
    expect(autoPromotableWinner(450, 550, 70)).toBe("B");
  });

  it("E.91: scanner winners always imply the UI card says significant (one-way)", () => {
    // The scanner (floor 200) and the operator's confidence card (floor
    // AB_MIN_SAMPLE_CLICKS=100) share the SAME variantConfidence math —
    // so anything the scanner acts on, the card must already claim.
    // The CONVERSE is deliberately false: the card can claim at n=100-199
    // while the scanner waits for 200 (the delta zone, pinned below).
    let scannerFires = 0;
    let deltaZone = 0;
    for (const weight of [10, 50, 90]) {
      for (let a = 0; a <= 300; a += 10) {
        for (let b = 0; b <= 300; b += 10) {
          const winner = autoPromotableWinner(a, b, weight);
          const card = variantConfidence(a, b, weight, AB_MIN_SAMPLE_CLICKS);
          if (winner) {
            scannerFires++;
            expect(card.significant, `w=${weight} a=${a} b=${b}`).toBe(true);
            expect(card.leader, `w=${weight} a=${a} b=${b}`).toBe(winner);
          } else if (card.leader && card.significant && a + b < AB_AUTO_PROMOTE_MIN_CLICKS) {
            deltaZone++; // card claims, scanner waits — the designed gap
          }
        }
      }
    }
    expect(scannerFires).toBeGreaterThan(0); // property not vacuous
    expect(deltaZone).toBeGreaterThan(0); // the 100-199 gap exists

    // Explicit delta-zone example: clear leader, n=110 >= card floor but
    // < scanner floor — the card claims, the scanner stays put.
    expect(variantConfidence(80, 30, 50, AB_MIN_SAMPLE_CLICKS)).toEqual({
      leader: "A",
      significant: true,
    });
    expect(autoPromotableWinner(80, 30, 50)).toBeNull();
  });
});

describe("abConfigSchema", () => {
  it("rejects weights not summing to 100", () => {
    expect(abConfigSchema.safeParse({ ...base, weightA: 51, weightB: 50 }).success).toBe(false);
  });
  it("rejects an empty urlB", () => {
    expect(abConfigSchema.safeParse({ ...base, urlB: "" }).success).toBe(false);
  });
  it("accepts null labels", () => {
    expect(abConfigSchema.safeParse({ ...base, labelA: null, labelB: null }).success).toBe(true);
  });
});

describe("E.2 time box (startsAt/endsAt)", () => {
  const t = (s: string) => Date.parse(s);
  const now = t("2026-06-15T12:00");

  it("parses configs without window keys (pre-E.2 rows, no migration)", () => {
    const cfg = parseAbConfig(serializeAbConfig(base));
    expect(cfg).not.toBeNull();
    expect(cfg!.startsAt).toBeUndefined();
    expect(isAbActive(cfg, now)).toBe(true);
  });

  it("rejects an unparseable window bound", () => {
    expect(abConfigSchema.safeParse({ ...base, startsAt: "not-a-date" }).success).toBe(false);
    expect(abConfigSchema.safeParse({ ...base, endsAt: "yesterday" }).success).toBe(false);
  });

  it("rejects end-before-start (permanently-inactive window)", () => {
    expect(
      abConfigSchema.safeParse({
        ...base,
        startsAt: "2026-06-20T00:00",
        endsAt: "2026-06-10T00:00",
      }).success,
    ).toBe(false);
  });

  it("accepts a valid window (end strictly after start)", () => {
    expect(
      abConfigSchema.safeParse({
        ...base,
        startsAt: "2026-06-01T00:00",
        endsAt: "2026-06-30T23:59",
      }).success,
    ).toBe(true);
  });

  it("splits only inside the window", () => {
    const cfg = parseAbConfig(
      serializeAbConfig({
        ...base,
        startsAt: "2026-06-01T00:00",
        endsAt: "2026-06-30T23:59",
      }),
    )!;
    expect(isAbActive(cfg, t("2026-05-31T23:59"))).toBe(false); // before
    expect(isAbActive(cfg, t("2026-06-01T00:00"))).toBe(true); // start edge (inclusive)
    expect(isAbActive(cfg, now)).toBe(true); // inside
    expect(isAbActive(cfg, t("2026-06-30T23:59"))).toBe(true); // end edge (inclusive)
    expect(isAbActive(cfg, t("2026-07-01T00:00"))).toBe(false); // after
  });

  it("E.98: window edges flip at the EXACT millisecond (±1ms), both bounds inclusive", () => {
    // The test above pins the edges at minute granularity; this pins the
    // true transition points: the start bound is inclusive (active from
    // s itself, not s+1ms), the end bound is inclusive through e itself
    // (inactive only from e+1ms).
    const cfg = parseAbConfig(
      serializeAbConfig({
        ...base,
        startsAt: "2026-06-01T00:00:00.000",
        endsAt: "2026-06-30T23:59:59.999",
      }),
    )!;
    const s = Date.parse("2026-06-01T00:00:00.000");
    const e = Date.parse("2026-06-30T23:59:59.999");
    expect(isAbActive(cfg, s - 1)).toBe(false); // last ms BEFORE start
    expect(isAbActive(cfg, s)).toBe(true); // start ms itself (inclusive)
    expect(isAbActive(cfg, e)).toBe(true); // end ms itself (inclusive)
    expect(isAbActive(cfg, e + 1)).toBe(false); // first ms AFTER end
  });

  it("E.98: unparseable window bounds degrade to unset in isAbActive (hand-built defense)", () => {
    // abConfigSchema REJECTS unparseable bounds (pinned elsewhere), so
    // parse can never hand this to serving — but the function's own
    // contract (docblock: hand-edited = treat as unset, never crash) is
    // pinned directly with a hand-built config bypassing the parser.
    const cfg = {
      ...base,
      startsAt: "not-a-date",
      endsAt: "also-not",
    };
    expect(isAbActive(cfg, Date.parse("2020-01-01T00:00"))).toBe(true); // far past
    expect(isAbActive(cfg, Date.parse("2099-01-01T00:00"))).toBe(true); // far future
  });

  it("start-only and end-only windows each bound one side", () => {
    const startOnly = parseAbConfig(
      serializeAbConfig({ ...base, startsAt: "2026-06-01T00:00" }),
    )!;
    expect(isAbActive(startOnly, t("2026-05-31T00:00"))).toBe(false);
    expect(isAbActive(startOnly, t("2027-01-01T00:00"))).toBe(true);

    const endOnly = parseAbConfig(
      serializeAbConfig({ ...base, endsAt: "2026-06-30T23:59" }),
    )!;
    expect(isAbActive(endOnly, t("2026-06-01T00:00"))).toBe(true);
    expect(isAbActive(endOnly, t("2026-07-15T00:00"))).toBe(false);
  });

  it("a paused test never splits regardless of window", () => {
    const cfg = parseAbConfig(
      serializeAbConfig({
        ...base,
        status: "paused",
        startsAt: "2026-06-01T00:00",
        endsAt: "2026-06-30T23:59",
      }),
    )!;
    expect(isAbActive(cfg, now)).toBe(false);
  });

  it("window round-trips through serialize/parse byte-identical", () => {
    const cfg = {
      ...base,
      startsAt: "2026-06-01T08:30",
      endsAt: "2026-06-30T18:00",
    };
    expect(parseAbConfig(serializeAbConfig(cfg))).toEqual(cfg);
  });

  it("AB_AUTO_PROMOTE_SETTING value is pinned (DB KV row key, E.49)", () => {
    // Every surface (settings page read, action read+write, client form
    // wire, scanner read) now imports this ONE constant from the pure
    // module — the exact string is DB compat for the settings row and must
    // never silently change.
    expect(AB_AUTO_PROMOTE_SETTING).toBe("abAutoPromote");
  });

  it("all 11 locale auto-promote hints carry the CURRENT threshold (E.53)", () => {
    // The locale hints are static translated strings ("200+ clicks" etc.)
    // and were the ONE threshold surface with no tripwire: changing
    // AB_AUTO_PROMOTE_MIN_CLICKS would silently leave 11 user-facing
    // strings lying. If this fails, update every locale's abAutoPromoteHint
    // — the docs (E.19) and CHANGELOG (E.29) tripwires cover the rest.
    const expected = String(AB_AUTO_PROMOTE_MIN_CLICKS);
    const localeFiles = readdirSync(resolve(process.cwd(), "src/locales"))
      .filter((f) => f.endsWith(".ts"));
    expect(localeFiles.length).toBe(11);
    const offenders = localeFiles.filter((f) => {
      const src = readFileSync(resolve(process.cwd(), "src/locales", f), "utf8");
      const m = src.match(/abAutoPromoteHint:\s*"([^"]*)"/);
      return !m || !m[1].includes(expected);
    });
    expect(offenders).toEqual([]);
  });

  it("no bidi-control characters in any ab* value across all 11 locales (E.68)", () => {
    // Bidi overrides (RLO/LRO/PDI/LRI...) can silently flip the rendered
    // order of mixed RTL/LTR text — a translation pasted from an RTL tool
    // could smuggle one in and mis-render the admin UI while every other
    // gate stays green. E.17 covered angle brackets and placeholders;
    // this covers the Unicode bidirectional-control class.
    const BIDI = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/;
    const localeFiles = readdirSync(resolve(process.cwd(), "src/locales")).filter(
      (f) => f.endsWith(".ts"),
    );
    expect(localeFiles.length).toBe(11);
    const offenders: string[] = [];
    for (const f of localeFiles) {
      const src = readFileSync(resolve(process.cwd(), "src/locales", f), "utf8");
      const values = [...src.matchAll(/(\bab[A-Za-z0-9]+:\s*")([^"]*)"/g)];
      // 30 distinct ab* keys exist in every locale — fewer means the scan
      // regex silently missed the file's shape.
      expect(values.length, `${f} ab-key count`).toBeGreaterThanOrEqual(30);
      for (const m of values) {
        if (BIDI.test(m[2])) offenders.push(`${f}: ${m[1]}${m[2]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every ab* placeholder name in en.ts matches all 10 translations (E.74)", () => {
    // i18n:audit's placeholder comparator covers ALL keys in CI, but its
    // matcher has documented edge cases (ICU plural name capture) — this
    // is the ab-scoped defense-in-depth pin: same placeholder-bearing
    // keys, same sorted placeholder names, in every translation.
    const dir = resolve(process.cwd(), "src/locales");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBe(11);
    const extract = (src: string): Record<string, string[]> => {
      const out: Record<string, string[]> = {};
      for (const m of src.matchAll(/(\bab[A-Za-z0-9]+):\s*"([^"]*)"/g)) {
        // Name = word chars right after "{" (stops at comma/close brace,
        // so "{n, plural, ...}" captures "n" — the locale-audit rule).
        const names = [...m[2].matchAll(/\{\s*([A-Za-z0-9_]+)/g)].map((p) => p[1]);
        if (names.length) out[m[1]] = names.sort();
      }
      return out;
    };
    const en = extract(readFileSync(resolve(dir, "en.ts"), "utf8"));
    // Self-check: the scan must actually find placeholder-bearing ab keys
    // (currently abArchivedNote + abPromote, both {variant}) — an empty
    // result means the regex drifted and the comparison is vacuous.
    expect(Object.keys(en).length).toBeGreaterThanOrEqual(2);
    for (const f of files.filter((f) => f !== "en.ts")) {
      const tr = extract(readFileSync(resolve(dir, f), "utf8"));
      expect(tr, `${f} ab placeholder parity`).toEqual(en);
    }
  });
});

describe("docs-drift tripwire (#81 E.19)", () => {
  const guide = readFileSync(resolve(process.cwd(), "docs/ab-testing.md"), "utf8");

  it("every README surface links the CURRENT guide path (#81 E.38)", () => {
    // docs:check verifies README *hash* sync but never the guide LINK —
    // a rename of docs/ab-testing.md (or a mirror edit dropping the link)
    // would break all 11 surfaces silently. Pin: each README*.md carries
    // exactly one ](docs/ab-testing.md) target and the file exists.
    const readmes = readdirSync(process.cwd()).filter(
      (f) => f.startsWith("README") && f.endsWith(".md"),
    );
    expect(readmes.length).toBe(11); // en + 10 translations
    for (const f of readmes) {
      const content = readFileSync(resolve(process.cwd(), f), "utf8");
      const matches = content.match(/\]\([^)]*ab-testing[^)]*\)/g) ?? [];
      expect(matches, `${f} guide link`).toEqual(["](docs/ab-testing.md)"]);
    }
  });

  it("the guide's confidence-floor sentence matches AB_MIN_SAMPLE_CLICKS", () => {
    // Exact phrase from the guide, number interpolated from the CODE —
    // raising/lowering the floor without updating the guide fails here.
    expect(guide).toContain(
      `below **${AB_MIN_SAMPLE_CLICKS} variant clicks** the card always says`,
    );
  });

  it("the guide's auto-promote sentence matches AB_AUTO_PROMOTE_MIN_CLICKS", () => {
    expect(guide).toContain(
      `reach **${AB_AUTO_PROMOTE_MIN_CLICKS}** with a significant margin`,
    );
  });

  it("E.29: the CHANGELOG #81 entry's floors come from the same constants", () => {
    // Second hardcoding surface for the same thresholds — a constant change
    // must fail on the release notes too, not just the guide.
    const changelog = readFileSync(resolve(process.cwd(), "CHANGELOG.md"), "utf8");
    expect(changelog).toContain(`a winner below ${AB_MIN_SAMPLE_CLICKS} clicks`);
    expect(changelog).toContain(`automatically at ${AB_AUTO_PROMOTE_MIN_CLICKS}+ clicks`);
  });

  it("the constants themselves stay sane (guard against an accidental 0)", () => {
    expect(AB_MIN_SAMPLE_CLICKS).toBeGreaterThanOrEqual(50);
    expect(AB_AUTO_PROMOTE_MIN_CLICKS).toBeGreaterThan(AB_MIN_SAMPLE_CLICKS);
  });

  it("E.89: the guide's remaining behavioral claims stay pinned to the CODE", () => {
    // The two floor sentences are already pinned above (E.19/E.29); this
    // covers the guide's other falsifiable claims: the 95% confidence
    // level, the window gate, and the cookieless/JS-free assignment.
    const libSrc = readFileSync(resolve(process.cwd(), "src/lib/ab-test.ts"), "utf8");
    const scannerSrc = readFileSync(
      resolve(process.cwd(), "src/server/ab-auto-promote.ts"),
      "utf8",
    );
    const routeSrc = readFileSync(resolve(process.cwd(), "src/app/go/[id]/route.ts"), "utf8");

    // "Statistically significant (95%)" <-> the z critical value in the math.
    expect(guide).toContain("Statistically significant (95%)");
    expect(libSrc).toContain("1.96");

    // "while a scheduled window is still open" <-> the scanner's
    // end-bound gate (end-bound-only: no endsAt = eligible).
    expect(guide).toContain("while a scheduled window is still open");
    expect(scannerSrc).toMatch(/if \(config\.endsAt\)/);
    expect(scannerSrc).toMatch(/Date\.now\(\) < end/);

    // "no JavaScript on the public page, no cookie" + "deterministic hash
    // on the server" <-> pure assignment fn present; the serve route must
    // read NO cookie at assignment time (E.34: cookieless by design).
    expect(guide).toContain("no JavaScript on the public page, no cookie");
    expect(guide).toContain("deterministic hash on");
    expect(libSrc).toContain("export function assignVariant");
    expect(routeSrc).not.toMatch(/cookies?\(/); // no cookie read at serve time
  });
});

describe("scanner prefilter drift guard (#81 E.25)", () => {
  // src/server/ab-auto-promote.ts prefilters rows with
  // links.abConfig LIKE '%"status":"running"%' before re-validating. That
  // SQL fragment must match serializeAbConfig's EXACT encoding of status —
  // a key-order/format change here would silently stop finding running
  // tests while every parse-level test stays green.
  const RUNNING_FRAG = '"status":"running"';

  it("a serialized running config always matches the scanner's LIKE fragment", () => {
    // The % chars in the scanner's LIKE pattern are SQL wildcards; the JSON
    // only has to carry this exact inner fragment.
    expect(serializeAbConfig({ ...base, status: "running" })).toContain(
      RUNNING_FRAG,
    );
  });

  it("paused and archived configs never match the running fragment", () => {
    for (const status of ["paused", "archived"] as const) {
      expect(serializeAbConfig({ ...base, status })).not.toContain(
        RUNNING_FRAG,
      );
    }
  });
});

describe("version forward-compat contract (#81 E.26)", () => {
  // v is z.literal(1): any future version MUST degrade to NULL (no test)
  // everywhere parseAbConfig is the gate — serve, actions, scanner, restore.
  // A schema loosening (coerce/optional) would otherwise half-apply configs
  // written for a future schema this build cannot honor.
  const future = JSON.stringify({ ...base, v: 2 });
  it("a v:2 config parses to NULL (never half-applies)", () => {
    expect(parseAbConfig(future)).toBeNull();
  });
  it("v:0 and string-typed v degrade to NULL too", () => {
    expect(parseAbConfig(JSON.stringify({ ...base, v: 0 }))).toBeNull();
    expect(parseAbConfig(JSON.stringify({ ...base, v: "1" }))).toBeNull();
  });
  it("the current version still parses (the guard is version-specific)", () => {
    expect(parseAbConfig(JSON.stringify({ ...base, v: 1 }))).not.toBeNull();
  });
});

describe("fleet-level assignment independence (#81 E.35)", () => {
  // Generalizes the pairwise fmix32 test to a realistic page: ONE visitor
  // hash assigned across 50 simultaneous links. A structurally broken hash
  // (bucket determined by the link id's low bits — the historical FNV-1a
  // failure mode) shows up as a constant or exact-parity sequence, or as
  // two visitors correlating with each other instead of with their hashes.
  const LINKS = Array.from({ length: 50 }, (_, i) => i + 1);
  const seq = (vh: string) => LINKS.map((id) => assignVariant(vh, id, 50, 50));

  it("one visitor's 50-link fleet is balanced, non-structural, and per-visitor", () => {
    const s1 = seq("fleet-visitor-1");
    const s2 = seq("fleet-visitor-2");

    // (1) Balance: n=50, fair coin sd ~7% — [10,40] is ~3sd of headroom.
    for (const s of [s1, s2]) {
      const bCount = s.filter((v) => v === "B").length;
      expect(bCount).toBeGreaterThanOrEqual(10);
      expect(bCount).toBeLessThanOrEqual(40);
    }

    // (2) No id-structure: neither constant nor exact id-parity alternation
    // (deterministic guards — a structural hash fails these every time).
    const parity = LINKS.map((id) => (id % 2 === 0 ? "A" : "B"));
    const parityInv = parity.map((v) => (v === "A" ? "B" : "A"));
    expect(s1).not.toEqual(LINKS.map(() => "A"));
    expect(s1).not.toEqual(LINKS.map(() => "B"));
    expect(s1).not.toEqual(parity);
    expect(s1).not.toEqual(parityInv);

    // (3) Cross-visitor divergence: two different hashes must disagree on
    // ~half the links (expected 25, sd ~3.5 — [12,38] is generous).
    const differ = s1.filter((v, i) => v !== s2[i]).length;
    expect(differ).toBeGreaterThanOrEqual(12);
    expect(differ).toBeLessThanOrEqual(38);
  });

  it("weights apply per link: a 1/99 fleet honors the extreme skew", () => {
    // Same visitor, extreme weights across 50 links: B should dominate
    // (~49.5 expected) — P(B < 40) at n=50, p=0.99 is astronomically small,
    // so this pins that per-link weights are honored at fleet scale (a
    // weight-ignoring hash would center around 25). All-B is the LIKELY
    // outcome at 99% (p^50 ≈ 0.60), so no degeneracy check belongs here —
    // non-degeneracy is pinned by the 50/50 test above.
    const s = LINKS.map((id) => assignVariant("fleet-visitor-3", id, 1, 99));
    const bCount = s.filter((v) => v === "B").length;
    expect(bCount).toBeGreaterThanOrEqual(40);
    expect(bCount).toBeLessThanOrEqual(50);
  });
});

describe("e2e spec static contract (#81 E.83)", () => {
  // The live e2e run is operator-gated (AB_LINK_SLUG), so nothing here
  // executes it — this pins that everything the spec REFERENCES still
  // exists: the route, the 302 it asserts, the selectors it drives, and
  // that it stays free of translated-string dependencies (public-page
  // strings are English-only by policy).
  const spec = readFileSync(resolve(process.cwd(), "e2e/ab-testing.spec.ts"), "utf8");
  const routeSrc = readFileSync(
    resolve(process.cwd(), "src/app/go/[id]/route.ts"),
    "utf8",
  );
  const publicPage = readFileSync(
    resolve(process.cwd(), "src/app/(public)/[slug]/page.tsx"),
    "utf8",
  );

  it("the /go route the spec calls exists and exports GET", () => {
    expect(spec).toContain("/go/");
    expect(routeSrc).toContain("export async function GET");
  });

  it("the 302 the spec asserts matches every REDIRECT in the route", () => {
    expect(spec).toContain("expect(res.status()).toBe(302)");
    // Scope to NextResponse.redirect sites — the route also has 400/404
    // JSON responses whose status must NOT be lumped into this claim.
    const statuses = [
      ...routeSrc.matchAll(/NextResponse\.redirect\([\s\S]{0,160}?status:\s*(\d+)/g),
    ].map((m) => m[1]);
    expect(statuses.length).toBeGreaterThanOrEqual(2); // off-link + main
    for (const s of statuses) expect(s).toBe("302");
  });

  it("every page.locator selector's tags exist in the public page it drives", () => {
    const selectors = [...spec.matchAll(/page\.locator\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(selectors.length).toBeGreaterThan(0); // the scan must find some
    for (const sel of selectors) {
      for (const tag of sel.match(/[a-z]+/g) ?? []) {
        expect(publicPage, `selector "${sel}" -> <${tag}`).toContain(`<${tag}`);
      }
    }
  });

  it("the spec carries NO translated-string dependencies (English-only public surface)", () => {
    expect(spec).not.toMatch(/getByText\(|getByRole\(|getByLabel\(/);
    expect(spec).not.toMatch(/useTranslations|getTranslations/);
  });

  it("E.127: any ab_* field the spec ever references must exist in the dialog/editor source", () => {
    // Grounded: the spec drives exactly ONE selector (`main a`) plus the
    // /go request — it has NO link-dialog/editor interaction today. Pin
    // both halves: the current field-free scope, and a future-proof rule —
    // an ab_* token appearing in the spec can only ship if the dialog or
    // editor actually renders that field (loop is empty today, live if it
    // grows).
    expect(spec).not.toMatch(/ab_urlB|ab_labelA|ab_labelB|ab_weightA|ab_startsAt|ab_endsAt|ab_enabled/);

    const dialog = readFileSync(
      resolve(process.cwd(), "src/app/(admin)/links/components/link-dialog.tsx"),
      "utf8",
    );
    const editor = readFileSync(
      resolve(process.cwd(), "src/app/(admin)/links/components/ab-test-editor.tsx"),
      "utf8",
    );
    const abTokens = new Set([...spec.matchAll(/\bab_[a-zA-Z]+/g)].map((m) => m[0]));
    for (const tok of abTokens) {
      expect(dialog.includes(tok) || editor.includes(tok), `spec field ${tok} missing in source`).toBe(
        true,
      );
    }
    expect(typeof abTokens.size).toBe("number"); // scan really ran
  });
});

describe("public surface A/B transparency (#81 E.113)", () => {
  it("renders from the current link row only — zero abConfig, zero i18n anywhere public", () => {
    // Promote pins the winner INTO link.url at action time (E.76/E.80), so
    // the public page never needs ab state: it passes the CURRENT row value
    // and the card resolves the href from it. Grounded: page.tsx has no
    // useTranslations, passes url={link.url}; build-link-card reads
    // link.url and routes http(s) through /go/:id (archived tests serve
    // the pinned url with no split). Pin the whole surface, not a sample.
    const page = readFileSync(resolve(process.cwd(), "src/app/(public)/[slug]/page.tsx"), "utf8");
    const compDir = resolve(process.cwd(), "src/components/public");
    const comps = readdirSync(compDir, { recursive: true })
      .map(String)
      .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes(".test."));
    expect(comps.length).toBeGreaterThan(5); // scan is real

    const sources: Array<[string, string]> = [
      ["public page", page],
      ...comps.map((f) => [f, readFileSync(resolve(compDir, f), "utf8")] as [string, string]),
    ];
    for (const [name, src] of sources) {
      expect(/abConfig|parseAbConfig/.test(src), `ab state in ${name}`).toBe(false);
      expect(/useTranslations|getTranslations/.test(src), `i18n in ${name}`).toBe(false);
    }

    // The winner path: current row value -> card -> /go recorder.
    expect(page).toContain("url={link.url}");
    const card = readFileSync(resolve(compDir, "build-link-card.ts"), "utf8");
    expect(card).toContain("const rawUrl = link.url");
    expect(card).toContain("/go/");
  });
});

describe("settings toggle contract (#81 E.116)", () => {
  it("auto-promote uses the shared constant on BOTH sides — no string-literal KV key anywhere", () => {
    // Grounded: the toggle is a client switch (onChange builds FormData
    // with fd.set(AB_AUTO_PROMOTE_SETTING, checked ? "on":"off")), the page
    // renders getSetting(AB_AUTO_PROMOTE_SETTING), and the action reads
    // formData.get(AB_AUTO_PROMOTE_SETTING) — one constant, three call
    // sites. The literal "abAutoPromote" also exists as an i18n KEY and a
    // DOM id, so the pin targets quoted literals in the SETTING calls only.
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(admin)/settings/page.tsx"),
      "utf8",
    );
    const dm = readFileSync(
      resolve(process.cwd(), "src/app/(admin)/settings/data-manager.tsx"),
      "utf8",
    );
    const action = readFileSync(
      resolve(process.cwd(), "src/server/actions/links.ts"),
      "utf8",
    );

    // Page: renders the CURRENT KV value through the shared constant.
    expect(page).toContain('import { AB_AUTO_PROMOTE_SETTING } from "@/lib/ab-test"');
    expect(page).toContain("getSetting(AB_AUTO_PROMOTE_SETTING)");
    expect(page).toContain("abAutoPromoteEnabled={abAutoPromote ===");

    // Switch -> action: the field key IS the constant the action reads.
    expect(dm).toContain("fd.set(AB_AUTO_PROMOTE_SETTING,");
    expect(dm).toContain("await setAbAutoPromote(fd)");
    expect(action).toContain("formData.get(AB_AUTO_PROMOTE_SETTING)");

    // Nobody spells the KV key as a bare quoted literal in a setting call.
    const surfaces: Array<[string, string]> = [
      ["settings page", page],
      ["data-manager", dm],
      ["links action", action],
    ];
    for (const [name, src] of surfaces) {
      const bare =
        /getSetting\("abAutoPromote"|fd\.set\("abAutoPromote"|formData\.get\("abAutoPromote"/.test(
          src,
        );
      expect(bare, `bare KV literal in ${name}`).toBe(false);
    }
  });
});

describe("stats detail surface contract (#81 E.125)", () => {
  it("shared parser + shared math only — no local threshold/z literals on the page or card", () => {
    // Grounded: page.tsx imports parseAbConfig and parses the raw row
    // (line 57) BEFORE handing AbTestCard a config; the card's confidence
    // and lift come from the shared fns; neither file contains a z-critical
    // or a bare 200 floor (greps verified: zero matches before this test).
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(admin)/links/[id]/page.tsx"),
      "utf8",
    );
    const card = readFileSync(
      resolve(process.cwd(), "src/app/(admin)/links/[id]/ab-test-card.tsx"),
      "utf8",
    );

    // The ONE parser sits between the raw stats/link row and the card.
    expect(page).toContain('import { parseAbConfig } from "@/lib/ab-test"');
    expect(page).toContain("parseAbConfig(link.abConfig ?? null)");

    // The card's math is the shared functions, never re-implemented.
    expect(card).toContain('from "@/lib/ab-test"');
    expect(card).toContain("variantConfidence");
    expect(card).toContain("variantLift");

    // No locally-hardcoded statistical constants anywhere on the surface.
    expect(page.includes("1.96"), "z-critical literal in page").toBe(false);
    expect(card.includes("1.96"), "z-critical literal in card").toBe(false);
    expect(card.includes("200"), "raw floor literal in card").toBe(false);
  });

  it("E.133: display labels surface ONLY on the stats card (A/B fallback); the CSV exports variant letters", () => {
    // Grounded: labelA/labelB render nowhere except ab-test-card (editor
    // inputs aside — E.124 pins those through to the action), always with
    // letter fallbacks so NULL labels still display; the export route has
    // ZERO label references (greps: 0 raw hits) and emits "A"/"B"/""
    // cells (pinned at runtime by E.95). Pins both halves so a label
    // leaking into the CSV (or fallbacks disappearing) fails here.
    const card = readFileSync(
      resolve(process.cwd(), "src/app/(admin)/links/[id]/ab-test-card.tsx"),
      "utf8",
    );
    const exportRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/analytics/export/route.ts"),
      "utf8",
    );

    expect(card).toContain('config.labelA || "A"');
    expect(card).toContain('config.labelB || "B"');

    expect(exportRoute).not.toContain("labelA");
    expect(exportRoute).not.toContain("labelB");
  });

  it("E.137: card status badge = stored config.status verbatim — window truth lives at /go (E.61)", () => {
    // Grounded: ab-test-card derives its badge ONLY from config.status
    // (line 64+), never imports isAbActive, and renders zero window fields;
    // the /go route owns live activity via isAbActive (line 70 — the
    // out-of-window bare-serving E.61 pinned). A window-CLOSED test shows
    // "running" on the card while serving bare: BY DESIGN (the badge is
    // the OPERATOR's state, the window is serving's), documented here so
    // nobody "fixes" one side without the other.
    const card = readFileSync(
      resolve(process.cwd(), "src/app/(admin)/links/[id]/ab-test-card.tsx"),
      "utf8",
    );
    const route = readFileSync(resolve(process.cwd(), "src/app/go/[id]/route.ts"), "utf8");

    expect(card).not.toContain("isAbActive");
    expect(card).not.toContain("startsAt");
    expect(card).toContain('config.status === "running"');
    expect(card).toContain('config.status === "paused"');
    expect(card).toContain('config.status === "archived"');

    expect(route).toContain("isAbActive");
    expect(route).toContain("const abActive = isAbActive(abConfig);");
  });
});
