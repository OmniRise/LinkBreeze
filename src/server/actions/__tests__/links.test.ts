import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  demoBlock: vi.fn((): string | null => null),
  getSession: vi.fn(async (): Promise<{ userId: number; username: string; exp: number; pv: number; role?: string } | null> => ({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1, role: "admin" })),
  revalidatePath: vi.fn(),
  createLink: vi.fn(async () => 1),
  updateLink: vi.fn(async () => undefined),
  deleteLink: vi.fn(async () => undefined),
  reorderLinks: vi.fn(async () => undefined),
  isSlugTaken: vi.fn(async () => false),
  fetchAndCacheFavicon: vi.fn(async (): Promise<string | null> => "/api/uploads/favicon-test.png"),
  extractDomain: vi.fn((url: string): string | null => {
    try { return new URL(url).hostname; } catch { return null; }
  }),
  saveIconUpload: vi.fn(async (file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
    // Mirror the real behavior enough for action tests: reject junk,
    // accept PNG/SVG-shaped buffers with a plausible uploads URL.
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length < 12) return { ok: false, error: "bad-format" };
    if (buf[0] === 0x89 && buf[1] === 0x50) return { ok: true, url: "/api/uploads/icon-0123456789abcdef.png" };
    const text = buf.toString("utf8");
    if (text.includes("<svg")) return { ok: true, url: "/api/uploads/icon-test.svg" };
    return { ok: false, error: "bad-format" };
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
  })),
}));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/demo", () => ({ demoBlock: mocks.demoBlock }));
// link-icons writes uploads to disk — stub saveIconUpload so tests never
// touch the filesystem, while keeping the sanitizer importable.
vi.mock("@/lib/link-icons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/link-icons")>();
  return {
    ...actual,
    saveIconUpload: mocks.saveIconUpload,
  };
});
vi.mock("@/lib/favicon", () => ({
  fetchAndCacheFavicon: mocks.fetchAndCacheFavicon,
  extractDomain: mocks.extractDomain,
}));
vi.mock("@/server/queries", () => ({
  createLink: mocks.createLink,
  updateLink: mocks.updateLink,
  deleteLink: mocks.deleteLink,
  reorderLinks: mocks.reorderLinks,
  getAllLinks: vi.fn(async () => []),
  isSlugTaken: mocks.isSlugTaken,
  // #124: the page-ownership gate (assertLinkPageAccess) resolves the target
  // page via getLink -> getPageById before mutating. Return a link on page 1
  // and a page owned by userId 1 so the default admin session is authorized.
  getLink: vi.fn(async () => ({ id: 1, pageId: 1 })),
  getPageById: vi.fn(async () => ({ id: 1, slug: "home", userId: 1 })),
  getDefaultPage: vi.fn(async () => ({ id: 1, slug: "home", userId: 1 })),
  // #124 2B: the capability gate resolves the session user's role ROW.
  getCapabilitiesForUser: vi.fn(async (): Promise<{ roleText: string; caps: { pagesLimit: number | null; visibility: string; manageAccounts: boolean; manageInstance: boolean } }> => ({
    roleText: "admin",
    caps: { pagesLimit: null, visibility: "manage_all", manageAccounts: true, manageInstance: true },
  })),
  countPagesByOwner: vi.fn(async (): Promise<number> => 0),
}));

import { createLink, updateLink, deleteLink, createDivider } from "@/server/actions/links";

function makeFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoBlock.mockReturnValue(null);
  mocks.getSession.mockResolvedValue({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1, role: "admin" });
});

describe("createLink", () => {
  it("rejects when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await createLink(makeFormData({ title: "Test", url: "https://example.com", isActive: "true", isHighlighted: "false" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe("Unauthorized");
  });

  it("rejects in demo mode", async () => {
    mocks.demoBlock.mockReturnValue("This is a read-only demo.");
    const res = await createLink(makeFormData({ title: "Test", url: "https://example.com", isActive: "true", isHighlighted: "false" }));
    expect(res.success).toBe(false);
  });

  it("creates a valid link", async () => {
    const res = await createLink(makeFormData({ title: "My Link", url: "https://example.com", type: "url", isActive: "true", isHighlighted: "false" }));
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/links");
  });

  it("rejects a missing title", async () => {
    const res = await createLink(makeFormData({ title: "", url: "https://example.com", isActive: "true", isHighlighted: "false" }));
    expect(res.success).toBe(false);
  });

  it("rejects a javascript: URL", async () => {
    const res = await createLink(makeFormData({ title: "XSS", url: "javascript:alert(1)", type: "url", isActive: "true", isHighlighted: "false" }));
    expect(res.success).toBe(false);
    expect(mocks.createLink).not.toHaveBeenCalled();
  });

  it("accepts mailto: for email type", async () => {
    const res = await createLink(makeFormData({ title: "Email", url: "mailto:test@example.com", type: "email", isActive: "true", isHighlighted: "false" }));
    expect(res.success).toBe(true);
  });

  it("accepts tel: for phone type", async () => {
    const res = await createLink(makeFormData({ title: "Phone", url: "tel:+212600000000", type: "phone", isActive: "true", isHighlighted: "false" }));
    expect(res.success).toBe(true);
  });

  it("accepts wa.me for whatsapp type", async () => {
    const res = await createLink(makeFormData({ title: "WA", url: "https://wa.me/212600000000", type: "whatsapp", isActive: "true", isHighlighted: "false" }));
    expect(res.success).toBe(true);
  });

  it("rejects non-wa.me https for whatsapp type", async () => {
    const res = await createLink(makeFormData({ title: "WA", url: "https://evil.com", type: "whatsapp", isActive: "true", isHighlighted: "false" }));
    expect(res.success).toBe(false);
  });

  it("maps empty sectionId to null (#86)", async () => {
    const res = await createLink(makeFormData({ title: "No Section", url: "https://example.com", type: "url", isActive: "true", isHighlighted: "false", sectionId: "" }));
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({ sectionId: null }));
  });

  it("passes a numeric sectionId through", async () => {
    const res = await createLink(makeFormData({ title: "Sectioned", url: "https://example.com", type: "url", isActive: "true", isHighlighted: "false", sectionId: "3" }));
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({ sectionId: 3 }));
  });

  // ── #93 popup cards ────────────────────────────────────────────────
  it("creates a text popup with body and CTA", async () => {
    const res = await createLink(makeFormData({
      title: "Shipping info",
      url: "https://example.com/shop",
      type: "text",
      popupText: "We ship **worldwide**.\n- 2–4 days\n- Free over 50",
      ctaLabel: "Visit the shop",
      isActive: "true",
      isHighlighted: "false",
    }));
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({
      type: "text",
      popupText: "We ship **worldwide**.\n- 2–4 days\n- Free over 50",
      ctaLabel: "Visit the shop",
      url: "https://example.com/shop",
    }));
  });

  it("creates a text popup without a CTA (empty URL)", async () => {
    const res = await createLink(makeFormData({
      title: "Hours",
      url: "",
      type: "text",
      popupText: "Mon–Fri, 9–18",
      isActive: "true",
      isHighlighted: "false",
    }));
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({
      type: "text",
      url: "",
      ctaLabel: null,
    }));
  });

  it("rejects a text popup with no body", async () => {
    const res = await createLink(makeFormData({
      title: "Empty",
      url: "",
      type: "text",
      popupText: "",
      isActive: "true",
      isHighlighted: "false",
    }));
    expect(res.success).toBe(false);
    expect(mocks.createLink).not.toHaveBeenCalled();
  });

  it("rejects a CTA label with no URL on text popups", async () => {
    const res = await createLink(makeFormData({
      title: "Dead CTA",
      url: "",
      type: "text",
      popupText: "body",
      ctaLabel: "Go",
      isActive: "true",
      isHighlighted: "false",
    }));
    expect(res.success).toBe(false);
  });

  it("normalizes a location query to a Google Maps URL with a baked CTA label", async () => {
    const res = await createLink(makeFormData({
      title: "Studio",
      url: "Hassan II Mosque, Casablanca",
      type: "location",
      popupText: "Open Mon–Fri",
      ctaLabel: "",
      isActive: "true",
      isHighlighted: "false",
    }));
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({
      type: "location",
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Hassan II Mosque, Casablanca")}`,
      ctaLabel: "Open in Google Maps",
    }));
  });

  it("keeps a pasted Google Maps URL unchanged on location popups", async () => {
    const pasted = "https://www.google.com/maps/place/Koutoubia/@31.6295,-7.9811,17z";
    const res = await createLink(makeFormData({
      title: "Pinned",
      url: pasted,
      type: "location",
      popupText: "x",
      isActive: "true",
      isHighlighted: "false",
    }));
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({ url: pasted }));
  });

  it("sanitizes a non-Google URL into a Google Maps search on location popups", async () => {
    const res = await createLink(makeFormData({
      title: "Evil map",
      url: "https://evil.example.com/maps",
      type: "location",
      popupText: "x",
      isActive: "true",
      isHighlighted: "false",
    }));
    // buildMapsUrl treats any non-Google input as a place query — the stored
    // URL is always a Google Maps URL, never the operator's raw string.
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("https://evil.example.com/maps")}`,
    }));
  });

  it("strips popup fields from classic link types", async () => {
    const res = await createLink(makeFormData({
      title: "Classic",
      url: "https://example.com",
      type: "url",
      popupText: "sneaky body",
      ctaLabel: "sneaky CTA",
      isActive: "true",
      isHighlighted: "false",
    }));
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({
      popupText: null,
      ctaLabel: null,
    }));
  });
});

describe("updateLink", () => {
  it("updates a valid link", async () => {
    const res = await updateLink(makeFormData({ id: "1", title: "Updated", url: "https://new.com", type: "url", isActive: "true", isHighlighted: "false" }));
    expect(res.success).toBe(true);
    expect(mocks.updateLink).toHaveBeenCalledOnce();
  });

  it("maps empty sectionId to null (#86)", async () => {
    const res = await updateLink(makeFormData({ id: "1", title: "Cleared", url: "https://new.com", type: "url", isActive: "true", isHighlighted: "false", sectionId: "" }));
    expect(res.success).toBe(true);
    expect(mocks.updateLink).toHaveBeenCalledWith(1, expect.objectContaining({ sectionId: null }));
  });

  it("rejects when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await updateLink(makeFormData({ id: "1", title: "Test", url: "https://example.com", isActive: "true", isHighlighted: "false" }));
    expect(res.success).toBe(false);
  });
});

describe("deleteLink", () => {
  it("deletes a link by id", async () => {
    const res = await deleteLink(makeFormData({ id: "5" }));
    expect(res.success).toBe(true);
    expect(mocks.deleteLink).toHaveBeenCalledWith(5);
  });

  it("rejects when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await deleteLink(makeFormData({ id: "5" }));
    expect(res.success).toBe(false);
  });

  it("rejects non-numeric id", async () => {
    const res = await deleteLink(makeFormData({ id: "abc" }));
    expect(res.success).toBe(false);
  });
});

// ─── Icon system (#91) ─────────────────────────────────────────────

describe("createLink icon modes (#91)", () => {
  it("lucide mode: stores the picked name and skips favicon fetch", async () => {
    const res = await createLink(makeFormData({
      title: "Rocket", url: "https://example.com", type: "url",
      isHighlighted: "off", isActive: "on",
      iconMode: "lucide", icon: "rocket",
    }));
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({
      iconMode: "lucide", icon: "rocket", iconUrl: null, customIconUrl: null,
    }));
    expect(mocks.fetchAndCacheFavicon).not.toHaveBeenCalled();
  });

  it("auto mode: keeps existing favicon behavior", async () => {
    const res = await createLink(makeFormData({
      title: "Auto", url: "https://example.com", type: "url",
      isHighlighted: "off", isActive: "on",
      iconMode: "auto", autoIcon: "on",
    }));
    expect(res.success).toBe(true);
    expect(mocks.fetchAndCacheFavicon).toHaveBeenCalled();
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({
      iconMode: "auto", iconUrl: "/api/uploads/favicon-test.png",
    }));
  });

  it("rejects unknown lucide names", async () => {
    const res = await createLink(makeFormData({
      title: "Bad", url: "https://example.com", type: "url",
      isHighlighted: "off", isActive: "on",
      iconMode: "lucide", icon: "not-a-real-icon-xyz",
    }));
    expect(res.success).toBe(false);
  });

  it("custom mode without a file or stored URL is rejected", async () => {
    const res = await createLink(makeFormData({
      title: "No file", url: "https://example.com", type: "url",
      isHighlighted: "off", isActive: "on",
      iconMode: "custom",
    }));
    expect(res.success).toBe(false);
  });

  it("custom mode with an uploaded PNG persists the uploads URL", async () => {
    const fd = makeFormData({
      title: "Custom", url: "https://example.com", type: "url",
      isHighlighted: "off", isActive: "on",
      iconMode: "custom",
    });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1b, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
    fd.set("iconFile", new File([png], "icon.png", { type: "image/png" }));
    const res = await createLink(fd);
    expect(res.success).toBe(true);
    const calls = mocks.createLink.mock.calls as unknown as Array<[Record<string, unknown>]>;
    const call = calls[0]?.[0];
    expect(call).toBeDefined();
    expect(String(call?.customIconUrl)).toMatch(/^\/api\/uploads\/icon-[0-9a-f]+\.png$/);
    expect(call?.iconMode).toBe("custom");
  });

  it("rejects a fake extension (malicious content sniffed as junk)", async () => {
    const fd = makeFormData({
      title: "Evil", url: "https://example.com", type: "url",
      isHighlighted: "off", isActive: "on",
      iconMode: "custom",
    });
    fd.set("iconFile", new File([Buffer.from("unmask-these-bytes-as-html")], "icon.png", { type: "image/png" }));
    const res = await createLink(fd);
    expect(res.success).toBe(false);
  });

  it("sanitizes an uploaded SVG (script stripped, svg root kept)", async () => {
    const fd = makeFormData({
      title: "Svg", url: "https://example.com", type: "url",
      isHighlighted: "off", isActive: "on",
      iconMode: "custom",
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M5 12h14"/></svg>`;
    fd.set("iconFile", new File([Buffer.from(svg)], "icon.svg", { type: "image/svg+xml" }));
    const res = await createLink(fd);
    expect(res.success).toBe(true);
    expect(mocks.fetchAndCacheFavicon).not.toHaveBeenCalled();
  });

  it("updateLink keeps the stored custom icon when no new file is sent", async () => {
    const fd = makeFormData({
      id: "1", title: "Keep", url: "https://example.com", type: "url",
      isHighlighted: "off", isActive: "on",
      iconMode: "custom", iconCustomUrl: "/api/uploads/icon-abc.png",
    });
    const res = await updateLink(fd);
    expect(res.success).toBe(true);
    expect(mocks.updateLink).toHaveBeenCalledWith(1, expect.objectContaining({
      customIconUrl: "/api/uploads/icon-abc.png", iconMode: "custom",
    }));
  });
});

describe("createDivider (#87)", () => {
  it("appends an inert divider row — no URL, no icon, no popup fields", async () => {
    const res = await createDivider(1);
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledOnce();
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({
      type: "divider",
      url: "",
      iconMode: "auto",
      autoIcon: false,
    }));
    // Dividers never fetch favicons.
    expect(mocks.fetchAndCacheFavicon).not.toHaveBeenCalled();
  });

  it("rejects when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await createDivider();
    expect(res.success).toBe(false);
    expect(mocks.createLink).not.toHaveBeenCalled();
  });

  it("createLink with type=divider normalizes any URL away", async () => {
    const res = await createLink(makeFormData({
      title: "—", url: "", type: "divider",
      isActive: "true", isHighlighted: "false",
    }));
    expect(res.success).toBe(true);
    const call = (mocks.createLink.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]![0];
    expect(call.url).toBe("");
    expect(call.ctaLabel).toBeNull();
    expect(call.popupText).toBeNull();
  });

  it("createLink rejects a divider carrying a URL (no URL smuggling)", async () => {
    const res = await createLink(makeFormData({
      title: "Evil", url: "https://example.com", type: "divider",
      isActive: "true", isHighlighted: "false",
    }));
    expect(res.success).toBe(false);
    expect(mocks.createLink).not.toHaveBeenCalled();
  });
});

describe("redirect slugs (#96)", () => {
  beforeEach(() => {
    mocks.isSlugTaken.mockResolvedValue(false);
  });

  it("creates a link with a normalized slug", async () => {
    const res = await createLink(makeFormData({
      title: "My Link", url: "https://example.com", type: "url",
      isActive: "true", isHighlighted: "false", redirectSlug: "My Consulting",
    }));
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledWith(
      expect.objectContaining({ redirectSlug: "my-consulting" }),
    );
  });

  it("stores null when no slug is submitted", async () => {
    const res = await createLink(makeFormData({
      title: "My Link", url: "https://example.com", type: "url",
      isActive: "true", isHighlighted: "false",
    }));
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledWith(
      expect.objectContaining({ redirectSlug: null }),
    );
  });

  it("rejects a reserved-word slug", async () => {
    const res = await createLink(makeFormData({
      title: "My Link", url: "https://example.com", type: "url",
      isActive: "true", isHighlighted: "false", redirectSlug: "dashboard",
    }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toContain("reserved");
    expect(mocks.createLink).not.toHaveBeenCalled();
  });

  it("rejects a pure-numeric slug", async () => {
    const res = await createLink(makeFormData({
      title: "My Link", url: "https://example.com", type: "url",
      isActive: "true", isHighlighted: "false", redirectSlug: "123",
    }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toContain("Numeric");
    expect(mocks.createLink).not.toHaveBeenCalled();
  });

  it("rejects a taken slug", async () => {
    mocks.isSlugTaken.mockResolvedValue(true);
    const res = await createLink(makeFormData({
      title: "My Link", url: "https://example.com", type: "url",
      isActive: "true", isHighlighted: "false", redirectSlug: "busy-slug",
    }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toContain("already in use");
    expect(mocks.createLink).not.toHaveBeenCalled();
  });

  it("update writes the slug when the field is present", async () => {
    const res = await updateLink(makeFormData({
      id: "1", title: "Updated", url: "https://new.com", type: "url",
      isActive: "true", isHighlighted: "false", redirectSlug: "fresh-slug",
    }));
    expect(res.success).toBe(true);
    expect(mocks.updateLink).toHaveBeenCalledWith(1, expect.objectContaining({ redirectSlug: "fresh-slug" }));
  });

  it("update clears the slug when the field is present but empty (tri-state)", async () => {
    const res = await updateLink(makeFormData({
      id: "1", title: "Updated", url: "https://new.com", type: "url",
      isActive: "true", isHighlighted: "false", redirectSlug: "",
    }));
    expect(res.success).toBe(true);
    expect(mocks.updateLink).toHaveBeenCalledWith(1, expect.objectContaining({ redirectSlug: null }));
  });

  it("update leaves the slug untouched when the field is absent (tri-state)", async () => {
    const res = await updateLink(makeFormData({
      id: "1", title: "Updated", url: "https://new.com", type: "url",
      isActive: "true", isHighlighted: "false",
    }));
    expect(res.success).toBe(true);
    const call = (mocks.updateLink.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect("redirectSlug" in call).toBe(false);
  });

  it("update excludes its own row from the availability check", async () => {
    const res = await updateLink(makeFormData({
      id: "5", title: "Updated", url: "https://new.com", type: "url",
      isActive: "true", isHighlighted: "false", redirectSlug: "same-slug",
    }));
    expect(res.success).toBe(true);
    expect(mocks.isSlugTaken).toHaveBeenCalledWith("same-slug", 5);
  });
});
