import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Rich-card live preview action — the session gate + scheme gate + failure
 * degradation contract. The dialog's debounced preview calls this while the
 * operator types; it must never throw to the client, never fetch without a
 * session, and never fetch non-http(s) schemes.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(async (): Promise<{ userId: number; username: string } | null> => ({
    userId: 1,
    username: "admin",
  })),
  fetchOgData: vi.fn(async (): Promise<{
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    siteName: string | null;
  }> => ({
    title: "Example",
    description: "An example description",
    imageUrl: "/api/uploads/og-abc123.jpg",
    siteName: "Example",
  })),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/og-fetcher", () => ({ fetchOgData: mocks.fetchOgData }));

import { previewOgData } from "@/server/actions/og-preview";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ userId: 1, username: "admin" });
  mocks.fetchOgData.mockResolvedValue({
    title: "Example",
    description: "An example description",
    imageUrl: "/api/uploads/og-abc123.jpg",
    siteName: "Example",
  });
});

describe("previewOgData", () => {
  it("returns null fields and never fetches without a session", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const out = await previewOgData("https://example.com/article");
    expect(out).toEqual({ imageUrl: null, description: null });
    expect(mocks.fetchOgData).not.toHaveBeenCalled();
  });

  it("returns the og image + description for a valid url", async () => {
    const out = await previewOgData("https://example.com/article");
    expect(mocks.fetchOgData).toHaveBeenCalledWith("https://example.com/article");
    expect(out).toEqual({
      imageUrl: "/api/uploads/og-abc123.jpg",
      description: "An example description",
    });
  });

  it("rejects non-http(s) schemes without fetching", async () => {
    for (const url of ["file:///etc/passwd", "data:text/html,x", "javascript:alert(1)"]) {
      const out = await previewOgData(url);
      expect(out).toEqual({ imageUrl: null, description: null });
    }
    expect(mocks.fetchOgData).not.toHaveBeenCalled();
  });

  it("degrades an unparseable url to null fields without fetching", async () => {
    const out = await previewOgData("not a url");
    expect(out).toEqual({ imageUrl: null, description: null });
    expect(mocks.fetchOgData).not.toHaveBeenCalled();
  });

  it("never throws when the fetcher itself throws", async () => {
    mocks.fetchOgData.mockRejectedValueOnce(new Error("network dead"));
    await expect(previewOgData("https://example.com")).resolves.toEqual({
      imageUrl: null,
      description: null,
    });
  });
});
