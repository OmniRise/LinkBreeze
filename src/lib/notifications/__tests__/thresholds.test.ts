import { describe, expect, it } from "vitest";
import { crossedLevel, thresholdFor } from "@/lib/notifications/thresholds";

describe("thresholdFor", () => {
  it("maps metrics to their config field", () => {
    const config = { clicksThreshold: 100, viewsThreshold: 1000 };
    expect(thresholdFor(config, "clicks")).toBe(100);
    expect(thresholdFor(config, "views")).toBe(1000);
  });

  it("returns null when the metric is off or unsupported", () => {
    expect(thresholdFor({ clicksThreshold: null, viewsThreshold: 10 }, "clicks")).toBeNull();
    expect(thresholdFor({ clicksThreshold: 1, viewsThreshold: 1 }, "form_submissions")).toBeNull();
  });
});

describe("crossedLevel", () => {
  it("returns 0 below the threshold", () => {
    expect(crossedLevel(0, 100)).toBe(0);
    expect(crossedLevel(99, 100)).toBe(0);
  });

  it("returns the highest fully-crossed multiple", () => {
    expect(crossedLevel(100, 100)).toBe(100);
    expect(crossedLevel(123, 100)).toBe(100);
    expect(crossedLevel(200, 100)).toBe(200);
    expect(crossedLevel(349, 100)).toBe(300);
  });

  it("guards against zero/negative thresholds", () => {
    expect(crossedLevel(500, 0)).toBe(0);
    expect(crossedLevel(500, -10)).toBe(0);
  });
});
