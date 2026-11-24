/**
 * Pure digest helpers (#13): week bucketing and message formatting.
 */
import { describe, it, expect } from "vitest";
import {
  formatDigestMessage,
  weekBucket,
  weekBucketStart,
  WEEK_MS,
} from "@/lib/notifications/digest";

describe("week bucketing", () => {
  it("is stable within a week and advances across the boundary", () => {
    const t0 = 2810 * WEEK_MS + Math.floor(WEEK_MS / 2); // mid-bucket
    expect(weekBucket(t0)).toBe(2810);
    // Still bucket 2810 one second before it ends; 2811 the moment after.
    expect(weekBucket(2811 * WEEK_MS - 1)).toBe(2810);
    expect(weekBucket(2811 * WEEK_MS)).toBe(2811);
    // A full week later is the next bucket, stable within it.
    expect(weekBucket(t0 + WEEK_MS)).toBe(2811);
    expect(weekBucket(t0 + WEEK_MS - 60_000)).toBe(2811);
  });

  it("start of bucket is bucket * WEEK_MS", () => {
    const b = weekBucket(1_765_432_100_000);
    expect(weekBucketStart(1_765_432_100_000)).toBe(b * WEEK_MS);
  });
});

describe("formatDigestMessage", () => {
  const now = 1_765_432_100_000;

  it("lists views, clicks, CTR and top links", () => {
    const msg = formatDigestMessage(
      {
        views: 1234,
        clicks: 321,
        topLinks: [
          { label: "My portfolio", clicks: 150 },
          { label: "Newsletter", clicks: 90 },
        ],
        newSubscribers: 12,
      },
      now,
    );
    expect(msg).toContain("1,234 page views");
    expect(msg).toContain("321 link clicks (26.0% CTR)");
    expect(msg).toContain("My portfolio (150)");
    expect(msg).toContain("Newsletter (90)");
    expect(msg).toContain("12 new subscribers");
  });

  it("omits empty sections and singularizes one subscriber", () => {
    const msg = formatDigestMessage(
      { views: 10, clicks: 1, topLinks: [], newSubscribers: 1 },
      now,
    );
    expect(msg).not.toContain("Top links");
    expect(msg).toContain("1 new subscriber");
    expect(msg).not.toContain("new subscribers");
  });

  it("handles a zero-traffic week without NaN", () => {
    const msg = formatDigestMessage(
      { views: 0, clicks: 0, topLinks: [], newSubscribers: 0 },
      now,
    );
    expect(msg).toContain("0.0% CTR");
  });
});
