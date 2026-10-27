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
import { parseAbConfig, serializeAbConfig, type AbConfig } from "@/lib/ab-test";
import { computeAbEditorInitial } from "@/app/(admin)/links/components/ab-test-editor";

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

  it("E.65: editor initial -> form -> setAbTest round-trips a WINDOWED config byte-for-byte", async () => {
    // The full loop a user actually drives: stored config seeds the editor
    // (computeAbEditorInitial), the form submits those values, the action
    // rebuilds and serializes — the payload must be byte-identical to the
    // canonical serialization of the original (window fields included).
    const stored: AbConfig = {
      v: 1,
      status: "running",
      labelA: "control",
      labelB: "short",
      urlB: "https://example.com/b",
      weightA: 70,
      weightB: 30,
      winner: null,
      startsAt: "2026-11-01T10:00",
      endsAt: "2026-11-08T10:00",
    };
    mocks.getLink.mockResolvedValue(urlLink(JSON.stringify(stored)));

    const init = computeAbEditorInitial(JSON.stringify(stored));
    expect(init).toEqual({
      urlB: "https://example.com/b",
      labelA: "control",
      labelB: "short",
      weightA: 70,
      startsAt: "2026-11-01T10:00",
      endsAt: "2026-11-08T10:00",
    });

    const res = await setAbTest(
      fd({
        id: "7",
        urlB: init!.urlB,
        labelA: init!.labelA,
        labelB: init!.labelB,
        weightA: String(init!.weightA),
        startsAt: init!.startsAt ?? "",
        endsAt: init!.endsAt ?? "",
      }),
    );
    expect(res.success).toBe(true);
    const [, data] = mocks.updateLink.mock.calls[0] as unknown as [
      number,
      { abConfig: string },
    ];
    expect(data.abConfig).toBe(serializeAbConfig(stored)); // byte-equal
  });

  it("E.65: an ARCHIVED config's winner + window survive a re-save (status documented archived->paused)", async () => {
    // The editor never edits `winner` — it must pass through untouched,
    // and the action's archived->paused rule is the only status change.
    const stored: AbConfig = {
      v: 1,
      status: "archived",
      labelA: "old",
      labelB: "new",
      urlB: "https://example.com/b",
      weightA: 60,
      weightB: 40,
      winner: "B",
      startsAt: "2026-06-01T08:00",
      endsAt: "2026-06-30T18:00",
    };
    mocks.getLink.mockResolvedValue(urlLink(JSON.stringify(stored)));

    const init = computeAbEditorInitial(JSON.stringify(stored));
    expect(init).not.toBeNull(); // fields seed fine; winner is NOT in the form

    const res = await setAbTest(
      fd({
        id: "7",
        urlB: init!.urlB,
        labelA: init!.labelA,
        labelB: init!.labelB,
        weightA: String(init!.weightA),
        startsAt: init!.startsAt ?? "",
        endsAt: init!.endsAt ?? "",
      }),
    );
    expect(res.success).toBe(true);
    const [, data] = mocks.updateLink.mock.calls[0] as unknown as [
      number,
      { abConfig: string },
    ];
    expect(data.abConfig).toBe(
      serializeAbConfig({ ...stored, status: "paused" }),
    ); // winner + window byte-equal; only status changed, as documented
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

  it("E.82: labels over the schema's 60-char cap are rejected (negative parity)", async () => {
    // Without the server-side cap a direct action call could store a
    // config abConfigSchema refuses to parse — the test would silently
    // degrade to NULL. The editor caps at 60 (maxLength); the action now
    // enforces the SAME boundary.
    mocks.getLink.mockResolvedValue(urlLink(null));
    const long = "x".repeat(61);
    const res = await setAbTest(
      fd({ id: "7", urlB: "https://example.com/b", weightA: "50", labelA: long }),
    );
    expect(res.success).toBe(false);
    expect(mocks.updateLink).not.toHaveBeenCalled();
    const resB = await setAbTest(
      fd({ id: "7", urlB: "https://example.com/b", weightA: "50", labelB: long }),
    );
    expect(resB.success).toBe(false);
    expect(mocks.updateLink).not.toHaveBeenCalled();

    // The exact boundary both layers agree on still passes and parses.
    const ok = await setAbTest(
      fd({ id: "7", urlB: "https://example.com/b", weightA: "50", labelA: "x".repeat(60) }),
    );
    expect(ok.success).toBe(true);
    expect(mocks.updateLink).toHaveBeenCalledTimes(1);
    const saved = mocks.updateLink.mock.calls[0] as unknown as [number, { abConfig: string }];
    expect(parseAbConfig(saved[1].abConfig)).not.toBeNull();
  });

  it("E.85: POSITIVE parity sweep - every valid payload succeeds at BOTH layers", async () => {
    // The positive mirror of E.82: a generated matrix of VALID payloads
    // (weights 1/50/99 x window {none, both, start-only} x labels
    // {both-empty->null, 1-char, 60-char cap}) must ALL be ACCEPTED by
    // the action AND the config it stores must parse back cleanly with
    // the same values — no valid payload may be refused at either layer.
    const weights = ["1", "50", "99"];
    const windows: Record<string, Record<string, string>> = {
      none: {},
      both: { startsAt: "2026-11-01T10:00", endsAt: "2026-11-08T10:00" },
      "start-only": { startsAt: "2026-11-01T10:00" },
    };
    const labels: Record<string, { labelA: string; labelB: string }> = {
      "both-empty": { labelA: "", labelB: "" },
      "1-char": { labelA: "a", labelB: "b" },
      "60-char": { labelA: "x".repeat(60), labelB: "" },
    };

    let done = 0;
    for (const weightA of weights) {
      for (const [wKey, windowFields] of Object.entries(windows)) {
        for (const [lKey, labelFields] of Object.entries(labels)) {
          mocks.getLink.mockResolvedValue(urlLink(null));
          const res = await setAbTest(
            fd({
              id: "7",
              urlB: "https://example.com/b",
              weightA,
              ...labelFields,
              ...windowFields,
            }),
          );
          expect(res.success, `payload w=${weightA} window=${wKey} labels=${lKey}`).toBe(true);
          done++;

          // The STORED result must parse at the schema layer with the
          // exact same values (the parity chain: accept -> store -> parse).
          const calls = mocks.updateLink.mock.calls as unknown as Array<
            [number, { abConfig: string }]
          >;
          const stored = calls[calls.length - 1][1].abConfig;
          const parsed = parseAbConfig(stored);
          expect(parsed, `parse w=${weightA} window=${wKey} labels=${lKey}`).not.toBeNull();
          expect(parsed!.v).toBe(1);
          expect(parsed!.status).toBe("running");
          expect(parsed!.winner).toBeNull();
          expect(parsed!.urlB).toBe("https://example.com/b");
          expect(parsed!.weightA).toBe(Number(weightA));
          expect(parsed!.weightB).toBe(100 - Number(weightA));
          expect(parsed!.labelA).toBe(labelFields.labelA || null);
          expect(parsed!.labelB).toBe(labelFields.labelB || null);
          expect(parsed!.startsAt).toBe(windowFields.startsAt ?? null);
          expect(parsed!.endsAt).toBe(windowFields.endsAt ?? null);
        }
      }
    }
    expect(done).toBe(27); // 3 weights x 3 windows x 3 label shapes
    expect(mocks.updateLink).toHaveBeenCalledTimes(27);
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

    // E.101: the claim "any other value" pinned against REAL garbage —
    // the action COERCES (checkbox semantics), it never rejects and it
    // never stores the raw string: only the exact literal "on" wins.
    for (const junk of ["yes", "ON", "On", "on ", "true", "1", "", "off "]) {
      const g = new FormData();
      g.set("abAutoPromote", junk);
      const r = await setAbAutoPromote(g);
      expect(r.success, `value ${JSON.stringify(junk)}`).toBe(true);
      expect(
        mocks.updateSetting.mock.calls[mocks.updateSetting.mock.calls.length - 1],
        `stored for ${JSON.stringify(junk)}`,
      ).toEqual(["abAutoPromote", "off"]);
    }
    // ...and "on" is the ONLY value that ever flips it on (case-sensitive).
    const exact = new FormData();
    exact.set("abAutoPromote", "on");
    await setAbAutoPromote(exact);
    expect(mocks.updateSetting.mock.calls[mocks.updateSetting.mock.calls.length - 1]).toEqual([
      "abAutoPromote",
      "on",
    ]);
  });
});

describe("E.104: A/B actions revalidate every surface that renders A/B state", () => {
  // Audit result: the surfaces are /links (list), /links/:id (stats
  // detail + ab-test-card), and / (public page — promote can change
  // link.url); /settings is the toggle's surface. /dashboard is NOT
  // revalidated by ANY link mutation (create/delete/reorder predate #81
  // and admin pages render dynamically) — convention-consistent, so it is
  // deliberately NOT added here; the theme preview renders a hardcoded
  // abConfig: null fixture and needs nothing.
  const THREE = [["/links"], ["/links/7"], ["/"]];

  it("setAbTest / setAbTestStatus / promoteAbVariant / removeAbTest each hit exactly the 3 targets", async () => {
    const expectThree = (label: string) => {
      expect(mocks.revalidatePath.mock.calls, label).toEqual(THREE);
      mocks.revalidatePath.mockClear();
    };

    mocks.getLink.mockResolvedValue(urlLink(null));
    await setAbTest(fd({ id: "7", urlB: "https://example.com/b", weightA: "50" }));
    expectThree("setAbTest");

    mocks.getLink.mockResolvedValue(urlLink(serializeAbConfig(runningConfig)));
    await setAbTestStatus(fd({ id: "7", status: "paused" }));
    expectThree("setAbTestStatus");

    mocks.getLink.mockResolvedValue(urlLink(serializeAbConfig(runningConfig)));
    await promoteAbVariant(fd({ id: "7", winner: "A" }));
    expectThree("promoteAbVariant");

    mocks.getLink.mockResolvedValue(urlLink(serializeAbConfig(runningConfig)));
    await removeAbTest(fd({ id: "7" }));
    expectThree("removeAbTest");
  });

  it("setAbAutoPromote revalidates /settings (its only rendering surface)", async () => {
    await setAbAutoPromote(fd({ abAutoPromote: "on" }));
    expect(mocks.revalidatePath.mock.calls).toEqual([["/settings"]]);
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

describe("error paths: invalid id + not-found (E.28)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.demoBlock.mockReturnValue(null);
    mocks.getSession.mockResolvedValue({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 });
    mocks.getLink.mockResolvedValue(urlLink(serializeAbConfig(runningConfig)));
  });

  const cases: Array<{ name: string; call: (data: Record<string, string>) => Promise<{ success: boolean; error?: string }> }> = [
    { name: "setAbTest", call: (d) => setAbTest(fd(d)) },
    { name: "setAbTestStatus", call: (d) => setAbTestStatus(fd(d)) },
    { name: "promoteAbVariant", call: (d) => promoteAbVariant(fd(d)) },
    { name: "removeAbTest", call: (d) => removeAbTest(fd(d)) },
  ];
  const payload = (name: string, id: string): Record<string, string> => {
    const base: Record<string, string> = { id };
    if (name === "setAbTest") Object.assign(base, { urlB: "https://example.com/b", weightA: "50" });
    if (name === "setAbTestStatus") base.status = "paused";
    if (name === "promoteAbVariant") base.winner = "B";
    return base;
  };

  for (const { name, call } of cases) {
    it(`${name}: non-numeric id is a validation error (no lookup)`, async () => {
      const res = await call(payload(name, "not-a-number"));
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error).toContain("Invalid link id");
      expect(mocks.getLink).not.toHaveBeenCalled();
    });

    it(`${name}: unknown id is not-found (no write)`, async () => {
      mocks.getLink.mockResolvedValue(null);
      const res = await call(payload(name, "999999"));
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error).toContain("Link not found");
      expect(mocks.updateLink).not.toHaveBeenCalled();
    });
  }
});
