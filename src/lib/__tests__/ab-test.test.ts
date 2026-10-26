import { describe, it, expect } from "vitest";
import {
  parseAbConfig,
  serializeAbConfig,
  isAbActive,
  assignVariant,
  resolveVariantUrl,
  variantLift,
  variantConfidence,
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

  it("is per-link: the same visitor gets independent assignments across links", () => {
    // Not asserting difference for ONE visitor (50% chance of collision);
    // asserting that assignments are not trivially identical across all
    // visitors for every link pair.
    let sameForAll = true;
    for (let linkId = 1; linkId <= 200 && sameForAll; linkId++) {
      if (assignVariant("fixed-visitor", linkId, 50, 50) !== "A") sameForAll = false;
    }
    expect(sameForAll).toBe(false);
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
