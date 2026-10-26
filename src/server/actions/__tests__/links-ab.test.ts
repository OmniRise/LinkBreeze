import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #81 A/B editor actions — setAbTest / setAbTestStatus / promoteAbVariant /
 * removeAbTest. Mocks per repo convention (demoGuard first line of every
 * mutating action; queries mocked so no DB is touched).
 */
const mocks = vi.hoisted(() => ({
  demoBlock: vi.fn((): string | null => null),
  getSession: vi.fn(async (): Promise<{ userId: number; username: string; exp: number; pv: number } | null> => ({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 })),
  revalidatePath: vi.fn(),
  updateLink: vi.fn(async () => undefined),
  getLink: vi.fn(async () => null as null | Record<string, unknown>),
  updateSetting: vi.fn(async () => undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/demo", () => ({ demoBlock: mocks.demoBlock }));
vi.mock("@/server/queries", () => ({
  getLink: mocks.getLink,
  updateLink: mocks.updateLink,
  createLink: vi.fn(),
  deleteLink: vi.fn(),
  getAllLinks: vi.fn(async () => []),
  reorderLinks: vi.fn(),
  isSlugTaken: vi.fn(async () => false),
  updateSetting: mocks.updateSetting,
  getSetting: vi.fn(async () => null),
}));

import {
  setAbTest,
  setAbAutoPromote,
  setAbTestStatus,
  promoteAbVariant,
  removeAbTest,
} from "@/server/actions/links";
import { serializeAbConfig, type AbConfig } from "@/lib/ab-test";

function urlLink(abConfig: string | null = null): Record<string, unknown> {
  return {
    id: 7,
    type: "url",
    url: "https://example.com/a",
    abConfig,
  };
}

const runningConfig: AbConfig = {
  v: 1,
  status: "running",
  labelA: null,
  labelB: null,
  urlB: "https://example.com/b",
  weightA: 50,
  weightB: 50,
  winner: null,
};

function fd(data: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoBlock.mockReturnValue(null);
  mocks.getSession.mockResolvedValue({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 });
  mocks.updateLink.mockResolvedValue(undefined);
});

describe("setAbTest", () => {
  it("demo mode blocks before anything else", async () => {
    mocks.demoBlock.mockReturnValue("Demo mode");
    const res = await setAbTest(fd({ id: "7", urlB: "https://example.com/b", weightA: "50" }));
    expect(res.success).toBe(false);
    expect(mocks.getLink).not.toHaveBeenCalled();
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await setAbTest(fd({ id: "7", urlB: "https://example.com/b", weightA: "50" }));
    expect(res.success).toBe(false);
  });

  it("creates a running test on a URL link", async () => {
    mocks.getLink.mockResolvedValue(urlLink(null));
    const res = await setAbTest(
      fd({ id: "7", urlB: "https://example.com/b", labelA: "control", labelB: "short", weightA: "70" }),
    );
    expect(res.success).toBe(true);
    expect(mocks.updateLink).toHaveBeenCalledTimes(1);
    const [id, data] = mocks.updateLink.mock.calls[0] as unknown as [number, { abConfig: string }];
    expect(id).toBe(7);
    const saved = JSON.parse(data.abConfig);
    expect(saved.status).toBe("running");
    expect(saved.urlB).toBe("https://example.com/b");
    expect(saved.weightA).toBe(70);
    expect(saved.weightB).toBe(30);
    expect(saved.labelA).toBe("control");
    expect(saved.labelB).toBe("short");
  });

  it("rejects a javascript: variant B URL (same validator as add-link)", async () => {
    mocks.getLink.mockResolvedValue(urlLink(null));
    const res = await setAbTest(fd({ id: "7", urlB: "javascript:alert(1)", weightA: "50" }));
    expect(res.success).toBe(false);
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("rejects a data: variant B URL", async () => {
    mocks.getLink.mockResolvedValue(urlLink(null));
    const res = await setAbTest(fd({ id: "7", urlB: "data:text/html,<script>", weightA: "50" }));
    expect(res.success).toBe(false);
  });

  it("rejects an empty variant B URL", async () => {
    mocks.getLink.mockResolvedValue(urlLink(null));
    const res = await setAbTest(fd({ id: "7", urlB: "  ", weightA: "50" }));
    expect(res.success).toBe(false);
  });

  it("rejects out-of-range weights (weights-sum invariant)", async () => {
    mocks.getLink.mockResolvedValue(urlLink(null));
    for (const w of ["0", "100", "-5", "abc", "50.5"]) {
      const res = await setAbTest(fd({ id: "7", urlB: "https://example.com/b", weightA: w }));
      expect(res.success).toBe(false);
    }
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("rejects non-URL link types (scope: URL links only)", async () => {
    mocks.getLink.mockResolvedValue({ ...urlLink(null), type: "email" });
    const res = await setAbTest(fd({ id: "7", urlB: "https://example.com/b", weightA: "50" }));
    expect(res.success).toBe(false);
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("re-saving an archived test reopens it as paused, never running", async () => {
    const archived = serializeAbConfig({ ...runningConfig, status: "archived", winner: "B" });
    mocks.getLink.mockResolvedValue(urlLink(archived));
    const res = await setAbTest(fd({ id: "7", urlB: "https://example.com/c", weightA: "50" }));
    expect(res.success).toBe(true);
    const [, data] = mocks.updateLink.mock.calls[0] as unknown as [number, { abConfig: string }];
    const saved = JSON.parse(data.abConfig);
    expect(saved.status).toBe("paused");
    expect(saved.winner).toBe("B"); // history preserved
    expect(saved.urlB).toBe("https://example.com/c");
  });

  it("re-saving a running test keeps it running", async () => {
    mocks.getLink.mockResolvedValue(urlLink(serializeAbConfig(runningConfig)));
    const res = await setAbTest(fd({ id: "7", urlB: "https://example.com/c", weightA: "60" }));
    expect(res.success).toBe(true);
    const [, data] = mocks.updateLink.mock.calls[0] as unknown as [number, { abConfig: string }];
    expect(JSON.parse(data.abConfig).status).toBe("running");
  });

  it("404s on a missing link", async () => {
    mocks.getLink.mockResolvedValue(null);
    const res = await setAbTest(fd({ id: "999", urlB: "https://example.com/b", weightA: "50" }));
    expect(res.success).toBe(false);
  });

  it("stores a valid time window (E.2)", async () => {
    mocks.getLink.mockResolvedValue(urlLink(null));
    const res = await setAbTest(
      fd({
        id: "7",
        urlB: "https://example.com/b",
        weightA: "50",
        startsAt: "2026-06-01T00:00",
        endsAt: "2026-06-30T23:59",
      }),
    );
    expect(res.success).toBe(true);
    const [, data] = mocks.updateLink.mock.calls[0] as unknown as [number, { abConfig: string }];
    const saved = JSON.parse(data.abConfig);
    expect(saved.startsAt).toBe("2026-06-01T00:00");
    expect(saved.endsAt).toBe("2026-06-30T23:59");
  });

  it("stores empty window fields as null (unbounded)", async () => {
    mocks.getLink.mockResolvedValue(urlLink(null));
    const res = await setAbTest(
      fd({ id: "7", urlB: "https://example.com/b", weightA: "50", startsAt: "", endsAt: "" }),
    );
    expect(res.success).toBe(true);
    const [, data] = mocks.updateLink.mock.calls[0] as unknown as [number, { abConfig: string }];
    const saved = JSON.parse(data.abConfig);
    expect(saved.startsAt).toBeNull();
    expect(saved.endsAt).toBeNull();
  });

  it("rejects end-before-start and garbage window bounds (E.2)", async () => {
    mocks.getLink.mockResolvedValue(urlLink(null));
    const reversed = await setAbTest(
      fd({
        id: "7",
        urlB: "https://example.com/b",
        weightA: "50",
        startsAt: "2026-06-20T00:00",
        endsAt: "2026-06-10T00:00",
      }),
    );
    expect(reversed.success).toBe(false);

    const garbage = await setAbTest(
      fd({ id: "7", urlB: "https://example.com/b", weightA: "50", startsAt: "whenever" }),
    );
    expect(garbage.success).toBe(false);
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });
});

describe("setAbTestStatus", () => {
  it("rejects unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await setAbTestStatus(fd({ id: "7", status: "paused" }));
    expect(res.success).toBe(false);
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("E.26: a future-version (v:2) config is treated as NO test — no write, no half-apply", async () => {
    // Version forward-compat contract: parseAbConfig (z.literal(1)) rejects
    // it, so every consumer sees "no A/B test". Actions must not write.
    mocks.getLink.mockResolvedValue(
      urlLink(JSON.stringify({ ...runningConfig, v: 2 })),
    );
    const res = await setAbTestStatus(fd({ id: "7", status: "paused" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toContain("no A/B test");
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("pauses a running test", async () => {
    mocks.getLink.mockResolvedValue(urlLink(serializeAbConfig(runningConfig)));
    const res = await setAbTestStatus(fd({ id: "7", status: "paused" }));
    expect(res.success).toBe(true);
    const [, data] = mocks.updateLink.mock.calls[0] as unknown as [number, { abConfig: string }];
    expect(JSON.parse(data.abConfig).status).toBe("paused");
  });

  it("resumes a paused test", async () => {
    mocks.getLink.mockResolvedValue(urlLink(serializeAbConfig({ ...runningConfig, status: "paused" })));
    const res = await setAbTestStatus(fd({ id: "7", status: "running" }));
    expect(res.success).toBe(true);
    const [, data] = mocks.updateLink.mock.calls[0] as unknown as [number, { abConfig: string }];
    expect(JSON.parse(data.abConfig).status).toBe("running");
  });

  it("refuses to restart an archived test", async () => {
    mocks.getLink.mockResolvedValue(urlLink(serializeAbConfig({ ...runningConfig, status: "archived", winner: "A" })));
    const res = await setAbTestStatus(fd({ id: "7", status: "running" }));
    expect(res.success).toBe(false);
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("rejects an invalid status value", async () => {
    mocks.getLink.mockResolvedValue(urlLink(serializeAbConfig(runningConfig)));
    const res = await setAbTestStatus(fd({ id: "7", status: "archived" }));
    expect(res.success).toBe(false);
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("rejects a link with no test", async () => {
    mocks.getLink.mockResolvedValue(urlLink(null));
    const res = await setAbTestStatus(fd({ id: "7", status: "paused" }));
    expect(res.success).toBe(false);
  });
});

describe("promoteAbVariant", () => {
  it("rejects unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await promoteAbVariant(fd({ id: "7", winner: "B" }));
    expect(res.success).toBe(false);
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("promoting A archives with winner A and leaves the URL alone", async () => {
    mocks.getLink.mockResolvedValue(urlLink(serializeAbConfig(runningConfig)));
    const res = await promoteAbVariant(fd({ id: "7", winner: "A" }));
    expect(res.success).toBe(true);
    const [id, data] = mocks.updateLink.mock.calls[0] as unknown as [number, { abConfig: string; url?: string }];
    expect(id).toBe(7);
    expect(data.url).toBeUndefined();
    const saved = JSON.parse(data.abConfig);
    expect(saved.status).toBe("archived");
    expect(saved.winner).toBe("A");
    // Full history kept: urlB, labels, weights.
    expect(saved.urlB).toBe("https://example.com/b");
  });

  it("promoting B pins urlB into the link URL and archives", async () => {
    mocks.getLink.mockResolvedValue(urlLink(serializeAbConfig(runningConfig)));
    const res = await promoteAbVariant(fd({ id: "7", winner: "B" }));
    expect(res.success).toBe(true);
    const [, data] = mocks.updateLink.mock.calls[0] as unknown as [number, { abConfig: string; url?: string }];
    expect(data.url).toBe("https://example.com/b");
    const saved = JSON.parse(data.abConfig);
    expect(saved.status).toBe("archived");
    expect(saved.winner).toBe("B");
  });

  it("re-checks the allowlist at promote time (stale/backup config defense)", async () => {
    const evil = serializeAbConfig({ ...runningConfig, urlB: "javascript:alert(1)" });
    mocks.getLink.mockResolvedValue(urlLink(evil));
    const res = await promoteAbVariant(fd({ id: "7", winner: "B" }));
    expect(res.success).toBe(false);
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("rejects an invalid winner", async () => {
    mocks.getLink.mockResolvedValue(urlLink(serializeAbConfig(runningConfig)));
    const res = await promoteAbVariant(fd({ id: "7", winner: "C" }));
    expect(res.success).toBe(false);
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });
});

describe("setAbAutoPromote (#81 E.1)", () => {
  it("demo mode blocks before anything else", async () => {
    mocks.demoBlock.mockReturnValue("Demo mode");
    const fd = new FormData();
    fd.set("abAutoPromote", "on");
    const res = await setAbAutoPromote(fd);
    expect(res.success).toBe(false);
    expect(mocks.getLink).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("abAutoPromote", "on");
    const res = await setAbAutoPromote(fd);
    expect(res.success).toBe(false);
  });

  it("stores 'on' when the checkbox is checked", async () => {
    const fd = new FormData();
    fd.set("abAutoPromote", "on");
    const res = await setAbAutoPromote(fd);
    expect(res.success).toBe(true);
    expect(mocks.updateSetting).toHaveBeenCalledWith("abAutoPromote", "on");
  });

  it("stores 'off' for any other value (default stays off)", async () => {
    const fd = new FormData();
    fd.set("abAutoPromote", "off");
    expect((await setAbAutoPromote(fd)).success).toBe(true);
    expect(mocks.updateSetting).toHaveBeenLastCalledWith("abAutoPromote", "off");

    const empty = new FormData(); // field absent -> off, never "on"
    expect((await setAbAutoPromote(empty)).success).toBe(true);
    expect(mocks.updateSetting).toHaveBeenLastCalledWith("abAutoPromote", "off");
  });
});

describe("removeAbTest", () => {
  it("rejects unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await removeAbTest(fd({ id: "7" }));
    expect(res.success).toBe(false);
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("clears the config to null", async () => {
    mocks.getLink.mockResolvedValue(urlLink(serializeAbConfig(runningConfig)));
    const res = await removeAbTest(fd({ id: "7" }));
    expect(res.success).toBe(true);
    expect(mocks.updateLink).toHaveBeenCalledWith(7, { abConfig: null });
  });

  it("rejects a link with no test", async () => {
    mocks.getLink.mockResolvedValue(urlLink(null));
    const res = await removeAbTest(fd({ id: "7" }));
    expect(res.success).toBe(false);
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("demo mode blocks", async () => {
    mocks.demoBlock.mockReturnValue("Demo mode");
    const res = await removeAbTest(fd({ id: "7" }));
    expect(res.success).toBe(false);
    expect(mocks.getLink).not.toHaveBeenCalled();
  });
});
