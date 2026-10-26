import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  interface Attempt { attempt: number; ok: boolean; httpStatus: number | null; error: string | null }
  interface DeliveryOutcome { ok: boolean; attempts: Attempt[] }
  return {
    demoGuard: vi.fn((): { success: false; error: string; errorCode: string } | null => null),
    getSession: vi.fn(async (): Promise<{ userId: number } | null> => ({ userId: 1 })),
    revalidatePath: vi.fn(),
    getConfigByPage: vi.fn<(pageId: number) => Promise<Record<string, unknown> | null>>(
      async () => null,
    ),
    createConfig: vi.fn<(input: Record<string, unknown>) => Promise<unknown>>(
      async () => ({}),
    ),
    updateConfig: vi.fn<(id: number, input: Record<string, unknown>) => Promise<void>>(
      async () => undefined,
    ),
    deleteForPage: vi.fn<(pageId: number) => Promise<void>>(async () => undefined),
    deliverToWebhook: vi.fn<(...args: unknown[]) => Promise<DeliveryOutcome>>(
      async () => ({ ok: true, attempts: [{ attempt: 1, ok: true, httpStatus: 200, error: null }] }),
    ),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/demo-guard", () => ({ demoGuard: mocks.demoGuard }));
vi.mock("@/server/queries/notifications", () => ({
  getNotificationConfigByPage: mocks.getConfigByPage,
  createNotificationConfig: mocks.createConfig,
  updateNotificationConfig: mocks.updateConfig,
  deleteNotificationConfigForPage: mocks.deleteForPage,
}));
vi.mock("@/server/notifications/emit", () => ({
  deliverToWebhook: mocks.deliverToWebhook,
}));

import {
  deleteNotificationConfigAction,
  saveNotificationConfigAction,
  sendTestNotificationAction,
} from "@/server/actions/notifications";

function fd(data: Record<string, string>): FormData {
  const out = new FormData();
  for (const [k, v] of Object.entries(data)) out.set(k, v);
  return out;
}

const VALID = {
  pageId: "3",
  url: "https://discord.com/api/webhooks/1/abc",
  provider: "discord",
  enabled: "true",
  clicksThreshold: "100",
  viewsThreshold: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoGuard.mockReturnValue(null);
  mocks.getSession.mockResolvedValue({ userId: 1 });
  mocks.getConfigByPage.mockResolvedValue(null);
  mocks.deliverToWebhook.mockResolvedValue({
    ok: true,
    attempts: [{ attempt: 1, ok: true, httpStatus: 200, error: null }],
  });
});

describe("saveNotificationConfigAction", () => {
  it("guards demo mode FIRST, before session and parsing", async () => {
    mocks.demoGuard.mockReturnValue({ success: false, error: "demo", errorCode: "demo" });
    const res = await saveNotificationConfigAction(fd({ pageId: "1" }));
    expect(res.success).toBe(false);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("rejects when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await saveNotificationConfigAction(fd(VALID));
    expect(res.success).toBe(false);
    expect(mocks.createConfig).not.toHaveBeenCalled();
  });

  it("rejects non-http(s) webhook URLs", async () => {
    const res = await saveNotificationConfigAction(fd({ ...VALID, url: "file:///etc/passwd" }));
    expect(res.success).toBe(false);
    const res2 = await saveNotificationConfigAction(fd({ ...VALID, url: "not a url" }));
    expect(res2.success).toBe(false);
    expect(mocks.createConfig).not.toHaveBeenCalled();
  });

  it("creates with parsed thresholds: empty string = null (metric off)", async () => {
    const res = await saveNotificationConfigAction(fd(VALID));
    expect(res.success).toBe(true);
    expect(mocks.createConfig).toHaveBeenCalledTimes(1);
    const arg = mocks.createConfig.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      pageId: 3,
      enabled: true,
      clicksThreshold: 100,
      viewsThreshold: null,
      provider: "discord",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("updates the existing config for the page instead of creating a second row", async () => {
    mocks.getConfigByPage.mockResolvedValue({ id: 42, pageId: 3 });
    await saveNotificationConfigAction(fd(VALID));
    expect(mocks.createConfig).not.toHaveBeenCalled();
    expect(mocks.updateConfig).toHaveBeenCalledTimes(1);
    expect(mocks.updateConfig.mock.calls[0]?.[0]).toBe(42);
  });

  it("treats junk thresholds as off", async () => {
    await saveNotificationConfigAction(
      fd({ ...VALID, clicksThreshold: "-5", viewsThreshold: "abc" }),
    );
    const arg = mocks.createConfig.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.clicksThreshold).toBeNull();
    expect(arg.viewsThreshold).toBeNull();
  });

  it("persists enabled=false", async () => {
    await saveNotificationConfigAction(fd({ ...VALID, enabled: "false" }));
    expect((mocks.createConfig.mock.calls[0]?.[0] as Record<string, unknown>).enabled).toBe(false);
  });
});

describe("sendTestNotificationAction", () => {
  it("requires a saved config", async () => {
    mocks.getConfigByPage.mockResolvedValue(null);
    const res = await sendTestNotificationAction(fd({ pageId: "3" }));
    expect(res.success).toBe(false);
    expect(mocks.deliverToWebhook).not.toHaveBeenCalled();
  });

  it("reports a delivered test with detail=null through the REAL pipeline call", async () => {
    mocks.getConfigByPage.mockResolvedValue({
      id: 7, pageId: 3, url: VALID.url, provider: "discord",
      clicksThreshold: 100, viewsThreshold: null,
    });
    const res = await sendTestNotificationAction(fd({ pageId: "3" }));
    expect(res.success).toBe(true);
    expect((res as { detail: string | null }).detail).toBeNull();
    expect(mocks.deliverToWebhook).toHaveBeenCalledTimes(1);
    const [config, event] = mocks.deliverToWebhook.mock.calls[0] as [
      { id: number },
      { type: string; dedupeKey: string },
    ];
    expect(config.id).toBe(7);
    expect(event.type).toBe("test");
    expect(event.dedupeKey).toMatch(/^test:7:/);
  });

  it("surfaces the last failure reason as detail on a failed delivery", async () => {
    mocks.getConfigByPage.mockResolvedValue({
      id: 7, pageId: 3, url: VALID.url, provider: "discord",
      clicksThreshold: 100, viewsThreshold: null,
    });
    mocks.deliverToWebhook.mockResolvedValue({
      ok: false,
      attempts: [
        { attempt: 1, ok: false, httpStatus: 500, error: "HTTP 500" },
        { attempt: 2, ok: false, httpStatus: 503, error: "HTTP 503" },
      ],
    });
    const res = await sendTestNotificationAction(fd({ pageId: "3" }));
    expect(res.success).toBe(true);
    expect((res as { detail: string | null }).detail).toBe("HTTP 503");
  });
});

describe("deleteNotificationConfigAction", () => {
  it("deletes the page's config (log cascades)", async () => {
    const res = await deleteNotificationConfigAction(fd({ pageId: "3" }));
    expect(res.success).toBe(true);
    expect(mocks.deleteForPage).toHaveBeenCalledWith(3);
  });

  it("rejects invalid page ids", async () => {
    const res = await deleteNotificationConfigAction(fd({ pageId: "nope" }));
    expect(res.success).toBe(false);
    expect(mocks.deleteForPage).not.toHaveBeenCalled();
  });
});
