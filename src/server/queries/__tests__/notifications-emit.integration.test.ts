/**
 * Integration tests: webhook notification emit API (#13).
 *
 * emitNotification is the ONE function features call: milestone dedupe,
 * disabled-config no-op, per-page scoping and throw-safety all live here.
 * Delivery is replaced via the setEmitDeps test seam; the runner and
 * formatters have their own pure unit tests.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import "./integration-setup";
import { db, seedPage, seedLink } from "./integration-setup";
import { recordClick, recordPageview } from "@/server/queries";
import {
  emitNotification,
  emitPageMilestones,
  setEmitDeps,
} from "@/server/notifications/emit";
import { notificationConfigs, notificationDeliveries } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { NotificationConfigLike, EmitDeps } from "@/server/notifications/emit";
import type { NotificationEvent } from "@/lib/notifications/events";

function seedConfig(overrides: Partial<typeof notificationConfigs.$inferInsert> = {}) {
  return db
    .insert(notificationConfigs)
    .values({
      pageId: 1,
      url: "https://discord.com/api/webhooks/1/abc",
      provider: "discord",
      enabled: true,
      clicksThreshold: 2,
      viewsThreshold: 3,
      ...overrides,
    })
    .returning()
    .get();
}

function allDeliveries() {
  return db.select().from(notificationDeliveries).all();
}

/** Deliver recorder: collects (configId, dedupeKey) pairs. */
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
});

describe("[integration] emitNotification milestones", () => {
  it("fires once at the click threshold, then only at the next level", async () => {
    const page = seedPage({ slug: "emit-a" });
    const link = seedLink({ pageId: page.id });
    const cfg = seedConfig({ pageId: page.id, viewsThreshold: null });
    const r = recorder();
    setEmitDeps(r.deps);

    await recordClick(link.id, "v1", null); // total 1 < 2
    expect(r.calls).toEqual([]);

    await recordClick(link.id, "v2", null); // total 2 -> level 2
    expect(r.calls).toEqual([{ configId: cfg.id, key: `milestone:clicks:${cfg.id}:2` }]);

    await recordClick(link.id, "v3", null); // total 3, level still 2, deduped
    expect(r.calls).toHaveLength(1);

    await recordClick(link.id, "v4", null); // total 4 -> level 4
    expect(r.calls).toHaveLength(2);
    expect(r.calls[1].key).toBe(`milestone:clicks:${cfg.id}:4`);
  });

  it("fires the views milestone through recordPageview", async () => {
    const page = seedPage({ slug: "emit-b" });
    const cfg = seedConfig({ pageId: page.id, clicksThreshold: null, viewsThreshold: 2 });
    const r = recorder();
    setEmitDeps(r.deps);

    await recordPageview("u1", null, null, null, page.id); // 1
    await recordPageview("u2", null, null, null, page.id); // 2 -> fires
    expect(r.calls).toEqual([{ configId: cfg.id, key: `milestone:views:${cfg.id}:2` }]);
  });

  it("disabled config = no-op", async () => {
    const page = seedPage({ slug: "emit-c" });
    const link = seedLink({ pageId: page.id });
    seedConfig({ pageId: page.id, enabled: false });
    const r = recorder();
    setEmitDeps(r.deps);

    await recordClick(link.id, "v1", null);
    await recordClick(link.id, "v2", null);
    await recordClick(link.id, "v3", null);
    expect(r.calls).toEqual([]);
  });

  it("per-page scoping: a config for page B never fires on page A events", async () => {
    const pageA = seedPage({ slug: "emit-a-page" });
    const pageB = seedPage({ slug: "emit-b-page" });
    const linkA = seedLink({ pageId: pageA.id });
    seedConfig({ pageId: pageB.id });
    const r = recorder();
    setEmitDeps(r.deps);

    await recordClick(linkA.id, "v1", null);
    await recordClick(linkA.id, "v2", null);
    expect(r.calls).toEqual([]);
  });

  it("throw-safety: a crashing deliverer never breaks the caller and dedupe still consumes", async () => {
    const page = seedPage({ slug: "emit-d" });
    const link = seedLink({ pageId: page.id });
    const cfg = seedConfig({ pageId: page.id });
    setEmitDeps({ deliverImpl: async () => { throw new Error("boom"); } });

    // Must not throw even though the deliverer does.
    await recordClick(link.id, "v1", null);
    await recordClick(link.id, "v2", null); // level 2: deliverImpl throws here

    // The click path completed: the analytics row landed, and the crashed
    // delivery was recorded as failed (claim semantics).
    const rows = allDeliveries();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].error).toBe("boom");

    // Dedupe was consumed by the ATTEMPT: fixing the deliverer does not
    // re-fire level 2.
    const r = recorder();
    setEmitDeps(r.deps);
    await emitNotification({
      type: "milestone", pageId: page.id, pageTitle: "x", slug: "emit-d",
      metric: "clicks", level: 0, total: 2, dedupeKey: "",
    });
    expect(r.calls).toEqual([]);
    void cfg;
  });

  it("emitPageMilestones is a no-op for a missing page", async () => {
    const r = recorder();
    setEmitDeps(r.deps);
    await expect(emitPageMilestones(99999)).resolves.toBeUndefined();
    expect(r.calls).toEqual([]);
  });
});

describe("[integration] real delivery pipeline writes the log", () => {
  it("success: one delivery row with http_status 200 and the dedupe key", async () => {
    const page = seedPage({ slug: "emit-e" });
    const cfg = seedConfig({ pageId: page.id, clicksThreshold: 100, viewsThreshold: null });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    setEmitDeps({ fetchImpl: fetchMock as unknown as typeof fetch, sleep: async () => {} });

    await emitNotification({
      type: "milestone", pageId: page.id, pageTitle: "Emit E", slug: "emit-e",
      metric: "clicks", level: 0, total: 100, dedupeKey: "",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const rows = allDeliveries();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("success");
    expect(rows[0].httpStatus).toBe(200);
    expect(rows[0].attempt).toBe(1);
    expect(rows[0].dedupeKey).toBe(`milestone:clicks:${cfg.id}:100`);
    expect(rows[0].configId).toBe(cfg.id);
  });

  it("failure: bounded retries end in one failed log row with the attempt count", async () => {
    const page = seedPage({ slug: "emit-f" });
    seedConfig({ pageId: page.id, clicksThreshold: 100 });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));
    setEmitDeps({ fetchImpl: fetchMock as unknown as typeof fetch, sleep: async () => {} });

    await emitNotification({
      type: "milestone", pageId: page.id, pageTitle: "Emit F", slug: "emit-f",
      metric: "clicks", level: 0, total: 150, dedupeKey: "",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const rows = allDeliveries();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].httpStatus).toBe(500);
    expect(rows[0].attempt).toBe(3);
    expect(rows[0].error).toBe("HTTP 500");
  });

  it("the delivery log provides dedupe: a second emit of the same level does not refire", async () => {
    const page = seedPage({ slug: "emit-g" });
    seedConfig({ pageId: page.id, clicksThreshold: 100 });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    setEmitDeps({ fetchImpl: fetchMock as unknown as typeof fetch, sleep: async () => {} });

    const event = {
      type: "milestone" as const, pageId: page.id, pageTitle: "Emit G", slug: "emit-g",
      metric: "clicks" as const, level: 0, total: 100, dedupeKey: "",
    };
    await emitNotification(event);
    await emitNotification(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(allDeliveries()).toHaveLength(1);
  });
});

// ── Wiring-specific coverage (goal audit 2026-11-05) ──────────────────

describe("[integration] #13 wiring guarantees", () => {
  it("fire-and-forget: the click request resolves BEFORE delivery completes, and the delivery still logs", async () => {
    const page = seedPage({ slug: "emit-fire" });
    const link = seedLink({ pageId: page.id });
    seedConfig({ pageId: page.id, viewsThreshold: null, clicksThreshold: 1 });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fetchMock = vi.fn(async (): Promise<Response> => {
      await gate;
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      // Production path: NO injected deps -> real fire-and-forget delivery
      // through the stubbed global fetch. Must not wait on the gated fetch.
      await recordClick(link.id, "v1", null);

      // The request path finished while delivery is still in flight.
      const pending = allDeliveries();
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe("pending");

      release();
      await vi.waitFor(() => {
        const rows = allDeliveries();
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe("success");
        expect(rows[0].httpStatus).toBe(200);
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fire-and-forget: a failing delivery never fails the request path", async () => {
    const page = seedPage({ slug: "emit-fail" });
    const link = seedLink({ pageId: page.id });
    seedConfig({ pageId: page.id, viewsThreshold: null, clicksThreshold: 1 });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => new Response("{}", { status: 500 })),
    );
    try {
      // Must resolve (not throw) even though every delivery attempt 500s.
      await expect(recordClick(link.id, "v1", null)).resolves.toBeUndefined();

      // The click itself landed despite the delivery failure; the retries
      // run on the real backoff (200ms + 800ms) off the request path, so
      // give the waitFor a window that outlasts the backoff.
      await vi.waitFor(
        () => {
          const rows = allDeliveries();
          expect(rows).toHaveLength(1);
          expect(rows[0].status).toBe("failed");
          expect(rows[0].attempt).toBe(3);
          expect(rows[0].httpStatus).toBe(500);
        },
        { timeout: 5_000, interval: 50 },
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("form_submission metric stays unwired (reserved for #125): emitNotification ignores it", async () => {
    const page = seedPage({ slug: "emit-form" });
    seedConfig({ pageId: page.id, clicksThreshold: 1, viewsThreshold: 1 });
    const r = recorder();
    setEmitDeps(r.deps);

    await emitNotification({
      type: "form_submission",
      pageId: page.id,
      pageTitle: "Emit Form",
      slug: "emit-form",
      metric: "form_submissions",
      level: 0,
      total: 10_000,
      dedupeKey: "",
    });
    expect(r.calls).toEqual([]);
    expect(allDeliveries()).toHaveLength(0);
  });

  it("instance-wide event (pageId: null) broadcasts to every enabled config", async () => {
    const pageA = seedPage({ slug: "emit-broadcast-a" });
    const pageB = seedPage({ slug: "emit-broadcast-b" });
    const cfgA = seedConfig({ pageId: pageA.id, clicksThreshold: 5, viewsThreshold: null });
    const cfgB = seedConfig({ pageId: pageB.id, clicksThreshold: 5, viewsThreshold: null });
    const disabled = seedConfig({
      pageId: pageA.id,
      enabled: false,
      clicksThreshold: 5,
      viewsThreshold: null,
    });
    const r = recorder();
    setEmitDeps(r.deps);

    // A null-page event matches every config (per-page configs are the only
    // kind the schema allows — page_id is NOT NULL — so "instance-wide" is
    // expressed as an event without a page, fanned out to all of them).
    await emitNotification({
      type: "milestone",
      pageId: null,
      pageTitle: "Instance",
      slug: null,
      metric: "clicks",
      level: 0,
      total: 10,
      dedupeKey: "",
    });
    expect(r.calls.map((c) => c.configId).sort()).toEqual([cfgA.id, cfgB.id].sort());
    expect(r.calls.map((c) => c.configId)).not.toContain(disabled.id);
  });

  it("clicks across ALL of a page's links aggregate into one page-level total", async () => {
    const page = seedPage({ slug: "emit-multi" });
    const link1 = seedLink({ pageId: page.id });
    const link2 = seedLink({ pageId: page.id });
    const cfg = seedConfig({ pageId: page.id, viewsThreshold: null, clicksThreshold: 3 });
    const r = recorder();
    setEmitDeps(r.deps);

    await recordClick(link1.id, "v1", null); // 1
    await recordClick(link2.id, "v2", null); // 2 — below threshold
    expect(r.calls).toEqual([]);

    await recordClick(link1.id, "v3", null); // 3 — crosses on the combined total
    expect(r.calls).toEqual([
      { configId: cfg.id, key: `milestone:clicks:${cfg.id}:3` },
    ]);
    void page;
  });
});

describe("[integration] notification config queries", () => {
  it("deletes cascade from pages", async () => {
    const page = seedPage({ slug: "emit-h" });
    const cfg = seedConfig({ pageId: page.id });
    db.delete(notificationConfigs).where(eq(notificationConfigs.id, cfg.id)).run();
    expect(db.select().from(notificationConfigs).all()).toHaveLength(0);
  });
});
