/**
 * Pure threshold math for milestone notifications (#13). Split from the
 * server emit module so it is fixture-testable without a DB.
 */

import type { NotificationMetric } from "./events";

export interface ThresholdCapableConfig {
  clicksThreshold: number | null;
  viewsThreshold: number | null;
}

/** Threshold that applies to a metric on a config (null = metric off). */
export function thresholdFor(
  config: ThresholdCapableConfig,
  metric: NotificationMetric,
): number | null {
  if (metric === "clicks") return config.clicksThreshold;
  if (metric === "views") return config.viewsThreshold;
  return null;
}

/** Highest fully-crossed multiple of the threshold (0 = nothing crossed). */
export function crossedLevel(total: number, threshold: number): number {
  if (threshold <= 0 || total < threshold) return 0;
  return Math.floor(total / threshold) * threshold;
}
