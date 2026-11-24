import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Drives the real fetchOgData against a stubbed global fetch: the page URL
// serves `html`, any other URL serves a tiny PNG (or whatever `routes` says).

const PAGE = "https://example.com/blog/post";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

let routes: Record<string, () => Response>;
let fetchMock: ReturnType<typeof vi.fn>;

function stubPage(html: string, contentType = "text/html; charset=utf-8"): void {
  routes[PAGE] = () => new Response(html, { status: 200, headers: { "content-type": contentType } });
}

async function og(html: string) {
  stubPage(html);
  const { fetchOgData } = await import("@/lib/og-fetcher");
  return fetchOgData(PAGE);
}

function fetchedUrls(): string[] {
  return fetchMock.mock.calls.map(([u]) => String(u));
}

describe("fetchOgData", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lb-og-"));
    process.env.UPLOAD_DIR = tmpDir;
    vi.resetModules();
    routes = {};
    fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      const route = routes[url];
      if (route) return route();
      return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env.UPLOAD_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("extracts standard og: tags and caches the image locally", async () => {
    const result = await og(`<html><head>
      <meta property="og:title" content="My Awesome Page" />
      <meta property="og:description" content="This is a great page about things" />
      <meta property="og:image" content="https://cdn.example.com/image.jpg" />
      <meta property="og:site_name" content="Example Site" />
    </head><body></body></html>`);
    expect(result.title).toBe("My Awesome Page");
    expect(result.description).toBe("This is a great page about things");
    expect(result.siteName).toBe("Example Site");
    expect(result.imageUrl).toMatch(/^\/api\/uploads\/og-[0-9a-f]{16}\.jpg$/);
    expect(fetchedUrls()).toContain("https://cdn.example.com/image.jpg");
  });

  it("falls back to twitter:, <title> and meta description", async () => {
    const tw = await og(`<html><head>
      <meta name="twitter:title" content="Twitter Title" />
      <meta name="twitter:description" content="Twitter desc" />
    </head></html>`);
    expect(tw.title).toBe("Twitter Title");
    expect(tw.description).toBe("Twitter desc");

    const plain = await og(`<html><head><title>Page Title</title>
      <meta name="description" content="Standard meta description" />
    </head></html>`);
    expect(plain.title).toBe("Page Title");
    expect(plain.description).toBe("Standard meta description");
  });

  it("handles reversed attribute order and prefers og: over twitter:", async () => {
    const result = await og(`<html><head>
      <meta content="OG Title" property="og:title" />
      <meta name="twitter:title" content="Twitter Title" />
    </head></html>`);
    expect(result.title).toBe("OG Title");
  });

  it("keeps apostrophes inside double-quoted content", async () => {
    const result = await og(`<html><head>
      <meta property="og:title" content="It's here" />
      <meta property="og:description" content="Don't miss Sam's launch" />
    </head></html>`);
    expect(result.title).toBe("It's here");
    expect(result.description).toBe("Don't miss Sam's launch");
  });

  it("decodes entities in og tags, <title> and meta description", async () => {
    const tagged = await og(`<html><head>
      <meta property="og:title" content="Tom &amp; Jerry &quot;The Show&quot; &mdash; &#8220;Live&#8221;" />
    </head></html>`);
    expect(tagged.title).toBe("Tom & Jerry \"The Show\" — “Live”");

    const plain = await og(`<html><head><title>Fish &amp; Chips</title>
      <meta name="description" content="Caf&eacute; &amp; bar" />
    </head></html>`);
    expect(plain.title).toBe("Fish & Chips");
    expect(plain.description).toBe("Café & bar");
  });

  it("resolves a relative og:image without a leading slash against the page", async () => {
    const result = await og(`<html><head>
      <meta property="og:image" content="img/cover.png" />
    </head></html>`);
    expect(result.imageUrl).toMatch(/^\/api\/uploads\/og-[0-9a-f]{16}\.png$/);
    expect(fetchedUrls()).toContain("https://example.com/blog/img/cover.png");
  });

  it("decodes non-UTF-8 pages using the declared charset", async () => {
    // "Café" in windows-1252: é is the single byte 0xE9.
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('<html><head><meta property="og:title" content="Caf'),
      0xe9,
      ...new TextEncoder().encode('"></head></html>'),
    ]);
    routes[PAGE] = () =>
      new Response(bytes, { status: 200, headers: { "content-type": "text/html; charset=windows-1252" } });
    const { fetchOgData } = await import("@/lib/og-fetcher");
    expect((await fetchOgData(PAGE)).title).toBe("Café");
  });

  it("does not follow an og:image redirect to a private address", async () => {
    routes["https://cdn.example.com/hop.jpg"] = () =>
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
    const result = await og(`<html><head>
      <meta property="og:title" content="Redirecting image" />
      <meta property="og:image" content="https://cdn.example.com/hop.jpg" />
    </head></html>`);
    expect(result.title).toBe("Redirecting image");
    expect(result.imageUrl).toBeNull();
    expect(fetchedUrls().some((u) => u.includes("169.254.169.254"))).toBe(false);
  });

  it("does not fetch private/internal pages", async () => {
    const { fetchOgData } = await import("@/lib/og-fetcher");
    const result = await fetchOgData("http://127.0.0.1/admin");
    expect(result).toEqual({ title: null, description: null, imageUrl: null, siteName: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for all fields on an error status", async () => {
    routes[PAGE] = () => new Response("<title>Not Found</title>", { status: 404, headers: { "content-type": "text/html" } });
    const { fetchOgData } = await import("@/lib/og-fetcher");
    expect(await fetchOgData(PAGE)).toEqual({ title: null, description: null, imageUrl: null, siteName: null });
  });
});
