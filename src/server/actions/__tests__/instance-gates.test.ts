/**
 * GHSA-954q-vph2-prc8 follow-up — instance-wide surfaces that still
 * accepted a bare session must be instance-admin-gated:
 *   - migration wizard (imports bulk links AND merges social links into
 *     any target page via a raw updatePage — the links half fail-closed
 *     through createLink's own page-access check, the social half did not)
 *   - setAbAutoPromote (instance-wide Settings → Data toggle)
 *   - custom font upload/delete (instance-wide theme fonts)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  demoBlock: vi.fn((): string | null => null),
  demoGuard: vi.fn((): { error: string; errorCode: string } | null => null),
  getSession: vi.fn(async () => ({ userId: 1 })),
  revalidatePath: vi.fn(),
  updateSetting: vi.fn(async () => {}),
  getDefaultPage: vi.fn(async () => ({ id: 1, slug: "admin" })),
  getPageById: vi.fn(async () => ({ id: 7, slug: "someone-else" })),
  updatePage: vi.fn(async () => {}),
  createLink: vi.fn(async () => ({ success: true })),
  deleteCustomFont: vi.fn(async () => ({ affectedThemes: [] })),
}));

vi.mock("@/server/access", () => ({ requireInstanceAdmin: mocks.gate }));
vi.mock("@/lib/demo", () => ({ demoBlock: mocks.demoBlock }));
vi.mock("@/lib/demo-guard", () => ({ demoGuard: mocks.demoGuard }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/queries", () => ({
  updateSetting: mocks.updateSetting,
  getDefaultPage: mocks.getDefaultPage,
  getPageById: mocks.getPageById,
  updatePage: mocks.updatePage,
  createLink: mocks.createLink,
  getCustomFontById: vi.fn(async () => ({ id: 3, url: "/uploads/f.woff2" })),
  getThemesUsingCustomFont: vi.fn(async () => []),
  deleteCustomFont: mocks.deleteCustomFont,
}));

import { confirmImport } from "@/server/actions/migration-wizard";
import { setAbAutoPromote } from "@/server/actions/links";
import { deleteCustomFontAction } from "@/server/actions/uploads";

const FORBIDDEN = { success: false as const, error: "Only instance admins can change instance settings", errorCode: "forbidden" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.gate.mockResolvedValue(null);
});

describe("confirmImport — instance-admin gate", () => {
  it("rejects a non-admin Member before touching any page", async () => {
    mocks.gate.mockResolvedValue(FORBIDDEN);
    const res = await confirmImport(null, new FormData());
    expect(res.success).toBe(false);
    expect(mocks.getPageById).not.toHaveBeenCalled();
    expect(mocks.getDefaultPage).not.toHaveBeenCalled();
    expect(mocks.updatePage).not.toHaveBeenCalled();
    expect(mocks.createLink).not.toHaveBeenCalled();
  });

  it("imports into the target page for an admin", async () => {
    const fd = new FormData();
    fd.set("links", JSON.stringify([{ selected: true, title: "Docs", url: "https://example.com/docs" }]));
    const res = await confirmImport(null, fd);
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledTimes(1);
  });
});

describe("setAbAutoPromote — instance-admin gate", () => {
  it("rejects a non-admin Member and never writes the setting", async () => {
    mocks.gate.mockResolvedValue(FORBIDDEN);
    const fd = new FormData();
    fd.set("abAutoPromote", "on");
    const res = await setAbAutoPromote(fd);
    expect(res.success).toBe(false);
    expect(mocks.updateSetting).not.toHaveBeenCalled();
  });

  it("writes the toggle for an admin", async () => {
    const fd = new FormData();
    fd.set("abAutoPromote", "on");
    const res = await setAbAutoPromote(fd);
    expect(res.success).toBe(true);
    expect(mocks.updateSetting).toHaveBeenCalled();
  });
});

describe("deleteCustomFontAction — instance-admin gate", () => {
  it("rejects a non-admin Member and never deletes the font", async () => {
    mocks.gate.mockResolvedValue(FORBIDDEN);
    const res = await deleteCustomFontAction(3);
    expect(res.success).toBe(false);
    expect(mocks.deleteCustomFont).not.toHaveBeenCalled();
  });
});
