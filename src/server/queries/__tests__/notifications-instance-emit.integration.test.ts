/**
 * Integration tests: instance-wide notification routing (#13).
 *
 * Instance events (subscriber/admin/update/digest) must reach ONLY enabled
 * instance-wide configs (pageId NULL) whose events CSV subscribes to the
 * kind, and each (config, dedupeKey) fires once. Opt-in guarantee: with no
 * subscribed config, emit is a no-op.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import "./integration-setup";
import { db } from "./integration-setup";
import {
  emitNotification,
  setEmitDeps,
} from "@/server/notifications/emit";
import {
  emitSubscriberPing,
  emitUpdatePing,
  maybeEmitWeeklyDigest,
  shouldNotifyAuditScope,
} from "@/server/notifications/instance-events";
import { notificationConfigs, notificationDeliveries, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { weekBucket } from "@/lib/notifications/digest";
import type { EmitDeps, NotificationConfigLike } from "@/server/notifications/emit";
import type { NotificationEvent } from "@/lib/notifications/events";

function seedInstanceConfig(events: string, provider = "discord") {
  return db
    .insert(notificationConfigs)
    .values({
      pageId: null,
      url: "https://discord.com/api/webhooks/inst",
      provider,
      events,
      enabled: true,
      clicksThreshold: null,
      viewsThreshold: null,
    })
    .returning()
    .get();
}

function seedPageConfig(pageId: number) {
  return db
    .insert(notificationConfigs)
    .values({
      pageId,
      url: "https://discord.com/api/webhooks/page",
      provider: "discord",
      events: "milestones",
      enabled: true,
      clicksThreshold: 2,
      viewsThreshold: null,
    })
    .returning()
    .get();
}

function recorder(): { calls: Array<{ configId: number; key: string }>; deps: EmitDeps } {
  const calls: Array<{ configId: number; key: string }> = [];
  const deps: EmitDeps = {
    deliverImpl: async (config: NotificationConfigLike, event: NotificationEvent) => {
      calls.push({ configId: config.id, key: event.dedupeKey });
    },
  };
  return { calls, deps };
}

afterEach(() => {
  setEmitDeps({});
  db.delete(notificationDeliveries).run();
  db.delete(notificationConfigs).run();
  db.delete(settings).where(eq(settings.key, "lastDigestEmitWeek")).run();
  vi.restoreAllMocks();
});

describe("[integration] instance event routing", () => {
  it("subscriber ping reaches the subscribed instance config only", async () => {
    const inst = seedInstanceConfig("subscribers,updates");
    seedPageConfig(1); // page config must NOT receive instance events
    const r = recorder();
    setEmitDeps(r.deps);

    await emitSubscriberPing(7, "reader@example.com");

    expect(r.calls).toEqual([
      { configId: inst.id, key: `subscribers:7` },
    ]);
    const rows = db.select().from(notificationDeliveries).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("success");
  });

  it("does not fire for kinds the config did not subscribe to", async () => {
    seedInstanceConfig("subscribers");
    const r = recorder();
    setEmitDeps(r.deps);

    await emitUpdatePing("9.9.9", "1.6.2", "notes here", "https://gh/release");

    expect(r.calls).toEqual([]);
    expect(db.select().from(notificationDeliveries).all()).toHaveLength(0);
  });

  it("no config at all: emit is a no-op (opt-in guarantee)", async () => {
    const r = recorder();
    setEmitDeps(r.deps);
    await emitSubscriberPing(1, "x@example.com");
    expect(r.calls).toEqual([]);
  });

  it("fires once per version: the dedupe key is the version", async () => {
    const inst = seedInstanceConfig("updates");
    const r = recorder();
    setEmitDeps(r.deps);

    await emitUpdatePing("1.7.0", "1.6.2", "what's new", "https://gh/v1.7.0");
    // Same version again (e.g. another settings load) — deduped.
    await emitUpdatePing("1.7.0", "1.6.2", "what's new", "https://gh/v1.7.0");
    // A different version fires again.
    await emitUpdatePing("1.8.0", "1.6.2", null, null);

    expect(r.calls).toEqual([
      { configId: inst.id, key: "updates:1.7.0" },
      { configId: inst.id, key: "updates:1.8.0" },
    ]);
  });

  it("routes by subscription across multiple instance configs", async () => {
    const digestOnly = seedInstanceConfig("digest", "generic");
    seedInstanceConfig("admin");
    const r = recorder();
    setEmitDeps(r.deps);

    await emitNotification({
      type: "digest",
      pageId: null,
      pageTitle: "",
      slug: null,
      title: "Weekly digest",
      message: "the digest body",
      dedupeKey: "digest:2600",
    });

    expect(r.calls).toEqual([{ configId: digestOnly.id, key: "digest:2600" }]);
  });
});

describe("[integration] weekly digest gate", () => {
  it("fires once per week bucket, then dedupes", async () => {
    seedInstanceConfig("digest");
    const r = recorder();
    setEmitDeps(r.deps);

    const week0 = 1_800_000_000_000;
    const fired = await maybeEmitWeeklyDigest(week0, {
      stats: { views: 10, clicks: 2, topLinks: [], newSubscribers: 0 },
    });
    expect(fired).toBe(true);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].key).toBe(`digest:${weekBucket(week0)}`);

    // Same week, later timestamp: deduped by the settings bucket stamp.
    const again = await maybeEmitWeeklyDigest(week0 + 3 * 86_400_000, {
      stats: { views: 99, clicks: 9, topLinks: [], newSubscribers: 0 },
    });
    expect(again).toBe(false);
    expect(r.calls).toHaveLength(1);

    // Next week fires again.
    const next = await maybeEmitWeeklyDigest(week0 + 7 * 86_400_000 + 1000, {
      stats: { views: 5, clicks: 1, topLinks: [], newSubscribers: 0 },
    });
    expect(next).toBe(true);
    expect(r.calls).toHaveLength(2);
  });

  it("is a no-op when no config subscribes to digest", async () => {
    seedInstanceConfig("subscribers");
    const r = recorder();
    setEmitDeps(r.deps);

    const fired = await maybeEmitWeeklyDigest(1_900_000_000_000, {
      stats: { views: 10, clicks: 2, topLinks: [], newSubscribers: 0 },
    });
    expect(fired).toBe(false);
    expect(r.calls).toEqual([]);
  });
});

describe("audit scope filter (pure)", () => {
  it("notifies on security scopes, not on noisy ones", () => {
    expect(shouldNotifyAuditScope("role.assigned")).toBe(true);
    expect(shouldNotifyAuditScope("sso.flow_mismatch")).toBe(true);
    expect(shouldNotifyAuditScope("account.deleted")).toBe(true);
    expect(shouldNotifyAuditScope("login.failed")).toBe(false);
    expect(shouldNotifyAuditScope("settings.updated")).toBe(false);
    expect(shouldNotifyAuditScope("login.success")).toBe(false);
  });
});
