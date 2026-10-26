/**
 * Integration tests: #81 A/B config sanitization on backup RESTORE.
 *
 * Security surface: a backup file is attacker-controllable input (users
 * download/edit/re-upload). Every ab_config it carries must be re-validated
 * on the way in — the SAME rules as the save path:
 *   - malformed JSON / bad weights / unknown status  -> dropped to null
 *   - variant B failing the isAllowedLinkUrl allowlist -> dropped to null
 *   - non-URL link types carrying a config            -> dropped to null
 *   - archived tests stay archived (a finished test can never resurrect a
 *     live split on restore)
 * The restore must NEVER reject the whole file over a bad config and never
 * store an unvalidated one.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import "./integration-setup";
import { db, seedPage } from "./integration-setup";
import { applyBackupPayload } from "@/server/backup-restore";
import { getSetting } from "@/server/queries";
import { links } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseAbConfig, type AbConfig } from "@/lib/ab-test";

const goodConfig: AbConfig = {
  v: 1,
  status: "running",
  labelA: "control",
  labelB: "short",
  urlB: "https://example.com/short",
  weightA: 50,
  weightB: 50,
  winner: null,
};

function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    pageId: 1,
    orderIndex: 0,
    type: "url",
    title: "Backup link",
    url: "https://example.com/a",
    isActive: true,
    isHighlighted: false,
    autoIcon: true,
    clicksCount: 0,
    createdAt: "2026-01-01 00:00:00",
    ...overrides,
  };
}

async function restoreWith(links_: unknown[]) {
  const res = await applyBackupPayload({
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: [],
    links: links_,
    settings: [],
    themes: [],
  });
  return res;
}

async function restoredConfig(id: number): Promise<AbConfig | null> {
  const rows = await db.select().from(links).where(eq(links.id, id));
  return parseAbConfig(rows[0]?.abConfig ?? null);
}

describe("[integration] A/B config restore sanitization (#81)", () => {
  beforeAll(() => {
    // One page for the whole file — applyBackupPayload doesn't touch pages,
    // but seedPage has a UNIQUE slug so per-test seeding would collide.
    seedPage();
  });
  it("round-trips a valid running config verbatim", async () => {
    const res = await restoreWith([
      linkRow({ abConfig: JSON.stringify(goodConfig) }),
    ]);
    expect(res.success).toBe(true);
    expect(await restoredConfig(501)).toEqual(goodConfig);
  });

  it("keeps an ARCHIVED config archived (no live-split resurrection)", async () => {
    const archived = { ...goodConfig, status: "archived", winner: "B" as const };
    const res = await restoreWith([
      linkRow({ abConfig: JSON.stringify(archived) }),
    ]);
    expect(res.success).toBe(true);
    const cfg = await restoredConfig(501);
    expect(cfg?.status).toBe("archived");
    expect(cfg?.winner).toBe("B");
  });

  it("drops a javascript: variant B to null (allowlist, same as save path)", async () => {
    const res = await restoreWith([
      linkRow({ abConfig: JSON.stringify({ ...goodConfig, urlB: "javascript:alert(1)" }) }),
    ]);
    expect(res.success).toBe(true);
    expect(await restoredConfig(501)).toBeNull();
    // The link itself survives — only the config is dropped.
    const rows = await db.select().from(links).where(eq(links.id, 501));
    expect(rows[0].url).toBe("https://example.com/a");
  });

  it("drops a data: variant B to null", async () => {
    await restoreWith([
      linkRow({ abConfig: JSON.stringify({ ...goodConfig, urlB: "data:text/html,<script>" }) }),
    ]);
    expect(await restoredConfig(501)).toBeNull();
  });

  it("drops malformed JSON to null without failing the restore", async () => {
    const res = await restoreWith([linkRow({ abConfig: "{broken" })]);
    expect(res.success).toBe(true);
    expect(await restoredConfig(501)).toBeNull();
  });

  it("drops configs whose weights do not sum to 100", async () => {
    await restoreWith([
      linkRow({ abConfig: JSON.stringify({ ...goodConfig, weightA: 30, weightB: 30 }) }),
    ]);
    expect(await restoredConfig(501)).toBeNull();
  });

  it("drops configs on non-URL link types (scope guard)", async () => {
    await restoreWith([
      linkRow({ type: "email", url: "mailto:x@example.com", abConfig: JSON.stringify(goodConfig) }),
    ]);
    expect(await restoredConfig(501)).toBeNull();
  });

  it("pre-A/B backups (no abConfig key) restore cleanly as null", async () => {
    const res = await restoreWith([linkRow()]);
    expect(res.success).toBe(true);
    expect(await restoredConfig(501)).toBeNull();
  });

  // ---- E.13: round-trips for the E.1/E.2 additions ----

  it("E.2: a time-boxed running config round-trips verbatim (window preserved)", async () => {
    const windowed = {
      ...goodConfig,
      startsAt: "2026-06-01T00:00",
      endsAt: "2026-06-30T23:59",
    };
    await restoreWith([linkRow({ abConfig: JSON.stringify(windowed) })]);
    const restored = await restoredConfig(501);
    expect(restored).not.toBeNull();
    expect(restored!.startsAt).toBe("2026-06-01T00:00");
    expect(restored!.endsAt).toBe("2026-06-30T23:59");
    expect(restored!.status).toBe("running"); // in-window configs keep serving
  });

  it("E.2: an ARCHIVED time-boxed config stays archived (window never resurrects)", async () => {
    await restoreWith([
      linkRow({
        abConfig: JSON.stringify({
          ...goodConfig,
          status: "archived",
          winner: "B",
          startsAt: "2026-06-01T00:00",
          endsAt: "2026-06-30T23:59",
        }),
      }),
    ]);
    const restored = await restoredConfig(501);
    expect(restored!.status).toBe("archived");
    expect(restored!.winner).toBe("B");
  });

  it("E.2: tampered window bounds are dropped like every other invalid config", async () => {
    // Unparseable bound (attacker edits the backup) — schema refine fails.
    await restoreWith([
      linkRow({ abConfig: JSON.stringify({ ...goodConfig, startsAt: "anytime soon" }) }),
    ]);
    expect(await restoredConfig(501)).toBeNull();

    // End-before-start would make the split permanently inactive — rejected.
    await restoreWith([
      linkRow({
        abConfig: JSON.stringify({
          ...goodConfig,
          startsAt: "2026-06-20T00:00",
          endsAt: "2026-06-10T00:00",
        }),
      }),
    ]);
    expect(await restoredConfig(501)).toBeNull();
  });

  it("E.1: the abAutoPromote toggle rides the settings KV through restore", async () => {
    // applyBackupPayload replaces the settings table wholesale, so a backup
    // carrying the toggle restores it verbatim (like every other app-behavior
    // KV). This is the intended semantics — settings are not secrets (the
    // standing settings-vs-env rule exists exactly for this class).
    const res = await applyBackupPayload({
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: [],
      links: [linkRow()],
      settings: [
        { key: "abAutoPromote", value: "on" },
        { key: "analyticsRetentionDays", value: "30" },
      ],
      themes: [],
    });
    expect(res.success).toBe(true);
    expect(await getSetting("abAutoPromote")).toBe("on");
    expect(await getSetting("analyticsRetentionDays")).toBe("30");
  });

  it("E.1: a backup WITHOUT the toggle restores it absent (defaults OFF)", async () => {
    await applyBackupPayload({
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: [],
      links: [],
      settings: [{ key: "analyticsRetentionDays", value: "7" }],
      themes: [],
    });
    // Absent key -> getSetting null -> the scanner's toggle check (=== "on")
    // reads OFF. Old backups can never enable automation.
    expect(await getSetting("abAutoPromote")).toBeNull();
  });
});
