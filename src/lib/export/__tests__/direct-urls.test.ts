import { describe, it, expect } from "vitest";
import { applyDirectUrls } from "@/lib/export/direct-urls";

const link = (over: Partial<{ id: number; url: string; redirectSlug: string | null }>) => ({
  id: 1,
  url: "https://example.com",
  redirectSlug: null,
  ...over,
});

describe("applyDirectUrls", () => {
  it("rewrites /go/<id> hrefs to the direct destination", () => {
    const html = `<a href="/go/1" target="_blank">x</a>`;
    expect(applyDirectUrls(html, [link({})])).toBe(
      `<a href="https://example.com" target="_blank">x</a>`,
    );
  });

  it("prefers the custom redirect slug when present", () => {
    const html = `<a href="/go/my-site">x</a>`;
    const out = applyDirectUrls(html, [link({ redirectSlug: "my-site" })]);
    expect(out).toContain(`href="https://example.com"`);
    expect(out).not.toContain("/go/my-site");
  });

  it("does not let /go/1 clobber /go/12 (quoted-attr match)", () => {
    const html = `<a href="/go/12">b</a><a href="/go/1">a</a>`;
    const out = applyDirectUrls(html, [
      link({ id: 12, url: "https://twelve.example" }),
      link({ id: 1, url: "https://one.example" }),
    ]);
    expect(out).toContain(`href="https://twelve.example"`);
    expect(out).toContain(`href="https://one.example"`);
    expect(out).not.toContain("/go/");
  });

  it("strips click and popup-open beacons", () => {
    const html = `<a onclick="
  navigator.sendBeacon('/api/track', JSON.stringify({type:'click',linkId:1}))">x</a>
<button onclick="var d=document.getElementById('lb-popup-2');if(!d)return false;navigator.sendBeacon('/api/track',JSON.stringify({type:'open',linkId:2}));d.showModal()">y</button>`;
    const out = applyDirectUrls(html, [link({ url: "mailto:a@b.c" })]);
    expect(out).not.toContain("sendBeacon");
    expect(out).not.toContain("/api/track");
    // the rest of the popup handler survives
    expect(out).toContain("d.showModal()");
    expect(out).toContain("getElementById('lb-popup-2')");
  });

  it("removes the emptied onclick attribute", () => {
    const html = `<a href="mailto:a@b.c" onclick="
  navigator.sendBeacon('/api/track', JSON.stringify({type:'click',linkId:1}))">x</a>`;
    const out = applyDirectUrls(html, [link({ url: "mailto:a@b.c" })]);
    expect(out).not.toContain("onclick");
    expect(out).toContain(`href="mailto:a@b.c"`);
  });

  it("escapes quotes in the direct URL", () => {
    const html = `<a href="/go/1">x</a>`;
    const out = applyDirectUrls(html, [
      link({ url: `https://e.com/?a="b"` }),
    ]);
    expect(out).toContain(`href="https://e.com/?a=&quot;b&quot;"`);
    expect(out).not.toContain(`a="b"`);
  });
});
