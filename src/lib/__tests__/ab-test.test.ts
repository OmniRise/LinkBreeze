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

  it("returns null for an unknown status", () => {
    expect(parseAbConfig(JSON.stringify({ ...base, status: "live" }))).toBeNull();
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
