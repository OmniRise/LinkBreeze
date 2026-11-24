/**
 * Social proof counters: pure formatting + visibility gate.
 */
import { describe, it, expect } from "vitest";

import {
  countTitle,
  formatCount,
  isSocialProofMode,
  isSocialProofPlacement,
  shouldShowBadge,
} from "@/lib/social-proof";

describe("formatCount", () => {
  it("raw grouping below 10K", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(3)).toBe("3");
    expect(formatCount(2341)).toBe("2,341");
    expect(formatCount(9999)).toBe("9,999");
  });

  it("compact with trimmed decimal at 10K and above", () => {
    expect(formatCount(10_000)).toBe("10K");
    expect(formatCount(12_345)).toBe("12.3K");
    expect(formatCount(999_999)).toBe("1000K");
    expect(formatCount(1_200_000)).toBe("1.2M");
    expect(formatCount(1_000_000_000)).toBe("1B");
  });

  it("defensive: negative and NaN clamp to 0", () => {
    expect(formatCount(-5)).toBe("0");
    expect(formatCount(Number.NaN)).toBe("0");
  });
});

describe("countTitle", () => {
  it("is always the exact number", () => {
    expect(countTitle(2_341)).toBe("2,341");
    expect(countTitle(1_234_567)).toBe("1,234,567");
  });
});

describe("shouldShowBadge (the dead-link gate)", () => {
  it("hides counts below the minimum", () => {
    expect(shouldShowBadge(99, 100)).toBe(false);
    expect(shouldShowBadge(100, 100)).toBe(true);
  });

  it("0 = always show, even zero counts", () => {
    expect(shouldShowBadge(0, 0)).toBe(true);
    expect(shouldShowBadge(0, 100)).toBe(false);
  });
});

describe("mode/placement guards", () => {
  it("accepts only the known modes", () => {
    expect(isSocialProofMode("off")).toBe(true);
    expect(isSocialProofMode("links")).toBe(true);
    expect(isSocialProofMode("page")).toBe(true);
    expect(isSocialProofMode("both")).toBe(true);
    expect(isSocialProofMode("everything")).toBe(false);
    expect(isSocialProofMode("")).toBe(false);
  });

  it("accepts only header/footer placements", () => {
    expect(isSocialProofPlacement("header")).toBe(true);
    expect(isSocialProofPlacement("footer")).toBe(true);
    expect(isSocialProofPlacement("sidebar")).toBe(false);
  });
});
