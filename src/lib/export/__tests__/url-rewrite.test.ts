import { describe, it, expect } from "vitest";
import {
  absolutizeAsset,
  collectUploadNames,
} from "@/lib/export/url-rewrite";
import { rewriteUploadPaths } from "@/lib/export/direct-urls";

describe("absolutizeAsset (assetBase mode, E.2)", () => {
  it("rewrites site-relative uploads to the flat asset base", () => {
    expect(
      absolutizeAsset("/api/uploads/avatar-1.png", "https://x.example", "uploads"),
    ).toBe("uploads/avatar-1.png");
  });

  it("keeps external URLs untouched in assetBase mode", () => {
    expect(
      absolutizeAsset("https://cdn.example/pic.jpg", "https://x.example", "uploads"),
    ).toBe("https://cdn.example/pic.jpg");
  });

  it("leaves data:/blob: URIs byte-verbatim in both modes (E.36)", () => {
    const uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    const blob = "blob:https://x.example/9f8e7d6c";
    for (const mode of ["uploads", undefined] as const) {
      expect(absolutizeAsset(uri, "https://x.example", mode)).toBe(uri);
      expect(absolutizeAsset(blob, "https://x.example", mode)).toBe(blob);
    }
    // and they are never collected for the zip
    const html = `<img src="${uri}"><img src='${blob}'>`;
    expect(collectUploadNames(html, "uploads")).toEqual([]);
  });

  it("still absolutizes against origin when assetBase is absent", () => {
    expect(absolutizeAsset("/api/uploads/a.png", "https://x.example")).toBe(
      "https://x.example/api/uploads/a.png",
    );
  });
});

describe("rewriteUploadPaths (E.2)", () => {
  it("rewrites verbatim /api/uploads/ URLs in src attributes", () => {
    const html = `<img src="/api/uploads/favicon-abc.png" /><img src="/api/uploads/thumb-2.webp">`;
    expect(rewriteUploadPaths(html)).toBe(
      `<img src="uploads/favicon-abc.png" /><img src="uploads/thumb-2.webp">`,
    );
  });

  it("rewrites inside CSS url() declarations", () => {
    expect(rewriteUploadPaths(`url('/api/uploads/bg.jpg')`)).toBe(
      `url('uploads/bg.jpg')`,
    );
  });

  it("leaves external URLs alone", () => {
    const html = `<img src="https://cdn.example/api/uploads/x.png">`;
    expect(rewriteUploadPaths(html)).toBe(html);
  });
});

describe("collectUploadNames (E.2)", () => {
  it("collects unique upload filenames from composed html", () => {
    const html = `<img src="uploads/a.png"><img src="uploads/b.webp"><img src="uploads/a.png">`;
    expect(collectUploadNames(html).sort()).toEqual(["a.png", "b.webp"]);
  });

  it("ignores external URLs and path traversal shapes", () => {
    const html = `<img src="https://cdn.example/uploads/x.png"><a href="uploads/..">t</a>`;
    const names = collectUploadNames(html);
    expect(names).not.toContain("x.png");
    expect(names).not.toContain("..");
  });
});
