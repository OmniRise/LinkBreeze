import { describe, it, expect } from "vitest";
import { crc32 } from "node:zlib";
import { createZip, dedupeNames, type ZipEntry } from "@/lib/export/zip";
import { exportFilename } from "@/lib/export/filename";
import { collectUploadNames } from "@/lib/export/url-rewrite";

/** Minimal STORE-method reader for round-trip assertions. */
function readZip(buf: Buffer): Array<{ name: string; content: string; crc: number }> {
  const entries: Array<{ name: string; content: string; crc: number }> = [];
  let off = 0;
  while (off + 4 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const crc = buf.readUInt32LE(off + 14);
    const size = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.subarray(off + 30, off + 30 + nameLen).toString("utf8");
    const start = off + 30 + nameLen + extraLen;
    const content = buf.subarray(start, start + size).toString("utf8");
    entries.push({ name, content, crc });
    off = start + size;
  }
  return entries;
}

function eocdCount(buf: Buffer): number {
  // EOCD is the last 22 bytes when there is no archive comment.
  const eocdOff = buf.length - 22;
  expect(buf.readUInt32LE(eocdOff)).toBe(0x06054b50);
  return buf.readUInt16LE(eocdOff + 10);
}

describe("createZip", () => {
  it("round-trips entries with correct CRCs (store method)", () => {
    const input = [
      { name: "jane.html", content: "<!DOCTYPE html><html>hello</html>" },
      { name: "second.html", content: "x".repeat(1000) },
    ];
    const zip = createZip(input);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50); // local header signature
    const out = readZip(zip);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe("jane.html");
    expect(out[0].content).toBe(input[0].content);
    expect(out[0].crc).toBe(crc32(Buffer.from(input[0].content, "utf8")));
    expect(out[1].content).toBe(input[1].content);
    expect(eocdCount(zip)).toBe(2);
  });

  it("handles UTF-8 entry names", () => {
    const zip = createZip([{ name: "ページ.html", content: "ok" }]);
    expect(readZip(zip)[0].name).toBe("ページ.html");
  });

  it("produces a deterministic archive for fixed input", () => {
    const input: ZipEntry[] = [{ name: "a.html", content: "same" }];
    expect(createZip(input).equals(createZip(input))).toBe(true);
  });
});

/**
 * E.13 — zip-slip regression. Archive entry names come from
 * exportFilename (hostile slugs) plus the fixed "uploads/" literal; a
 * name containing a path separator could escape the extraction
 * directory on unzip. Prove the sanitizer makes that impossible.
 */
describe("zip-slip: entry names are always flat", () => {
  const hostileSlugs = [
    "../../etc/cron.d/x",
    "..\\..\\windows\\system32\\evil",
    "a/b/c",
    "/absolute/path",
    "....//....//x",
    "C:\\evil",
    ".hidden",
  ];

  it("exportFilename never emits a path separator", () => {
    for (const slug of hostileSlugs) {
      const name = exportFilename(slug);
      expect(name, slug).not.toContain("/");
      expect(name, slug).not.toContain("\\");
      expect(name, slug).toMatch(/^[A-Za-z0-9-_.@]+\.html$/);
    }
  });

  it("a hostile-slug batch produces a zip with only flat entries", () => {
    const entries: ZipEntry[] = hostileSlugs.map((slug) => ({
      name: exportFilename(slug),
      content: "x",
    }));
    const zip = createZip(entries);
    // parse local headers and re-check every stored name
    let off = 0;
    let count = 0;
    while (off + 4 <= zip.length && zip.readUInt32LE(off) === 0x04034b50) {
      const size = zip.readUInt32LE(off + 18);
      const nameLen = zip.readUInt16LE(off + 26);
      const extraLen = zip.readUInt16LE(off + 28);
      const name = zip.subarray(off + 30, off + 30 + nameLen).toString("utf8");
      expect(name).not.toContain("/");
      expect(name).not.toContain("\\");
      count++;
      off = off + 30 + nameLen + extraLen + size;
    }
    expect(count).toBe(hostileSlugs.length);
  });

  it("collectUploadNames can never yield separators (file charset)", () => {
    const html = '<img src="uploads/a/../b.png"><img src="uploads/x/y.png">';
    for (const name of collectUploadNames(html)) {
      expect(name).not.toContain("/");
      expect(name).not.toContain("\\");
    }
  });
});

describe("dedupeNames", () => {
  it("keeps unique names untouched", () => {
    expect(dedupeNames(["a.html", "b.html"])).toEqual(["a.html", "b.html"]);
  });

  it("suffixes duplicates before the extension", () => {
    expect(dedupeNames(["a.html", "a.html", "a.html", "b.html"])).toEqual([
      "a.html",
      "a-2.html",
      "a-3.html",
      "b.html",
    ]);
  });

  it("handles names without extensions", () => {
    expect(dedupeNames(["x", "x"])).toEqual(["x", "x-2"]);
  });

  it("12 identical names yield 12 unique flat entries (E.34)", () => {
    const out = dedupeNames(Array(12).fill("page.html"));
    expect(out).toHaveLength(12);
    expect(new Set(out).size).toBe(12);
    expect(out[0]).toBe("page.html");
    expect(out[1]).toBe("page-2.html");
    expect(out[11]).toBe("page-12.html");
    for (const name of out) {
      expect(name).not.toContain("/");
      expect(name).not.toContain("\\");
    }
  });

  it("EOCD is a clean 22-byte tail: zero comment, counts and offsets exact (E.102)", () => {
    const entries: ZipEntry[] = [
      { name: "a.html", content: "<!DOCTYPE html>" },
      { name: "b.html", content: "<!DOCTYPE html><p>x" },
      { name: "c.html", content: "y".repeat(300) },
    ];
    const zip = createZip(entries);
    const eocdStart = zip.length - 22;
    expect(eocdStart).toBeGreaterThan(0);
    // signature at the tail
    expect(zip.readUInt32LE(eocdStart)).toBe(0x06054b50);
    // comment length field (last 2 bytes of file) = 0 → no trailing bytes
    expect(zip.readUInt16LE(zip.length - 2)).toBe(0);
    // entry counts (disk + total) match
    expect(zip.readUInt16LE(eocdStart + 8)).toBe(3);
    expect(zip.readUInt16LE(eocdStart + 10)).toBe(3);
    // central directory offset + size land exactly at the EOCD
    const cdSize = zip.readUInt32LE(eocdStart + 12);
    const cdOffset = zip.readUInt32LE(eocdStart + 16);
    expect(cdOffset + cdSize).toBe(eocdStart);
    expect(cdSize).toBeGreaterThan(0);
  });

  it("EFS bit ON + UTF-8 name bytes round-trip, ASCII and unicode (E.162)", () => {
    // zip.ts sets FLAG_UTF8 (0x0800) unconditionally on both headers —
    // spec-tolerated for ASCII names (python zipfile extracts cleanly,
    // E.157) and REQUIRED for unicode. The invariant: bit 11 set AND
    // the stored name bytes decode back exactly.
    const names = ["plain.html", "@janedoe-export.html", "café-页面.html"];
    const zip = createZip(names.map((n) => ({ name: n, content: "x" })));
    let off = 0;
    for (let i = 0; i < names.length; i += 1) {
      const localFlags = zip.readUInt16LE(off + 6);
      expect(localFlags & 0x0800, `local EFS ${names[i]}`).toBe(0x0800);
      const nameLen = zip.readUInt16LE(off + 26);
      const stored = zip.subarray(off + 30, off + 30 + nameLen).toString("utf8");
      expect(stored, `local name ${names[i]}`).toBe(names[i]);
      const extraLen = zip.readUInt16LE(off + 28);
      const size = zip.readUInt32LE(off + 18);
      off = off + 30 + nameLen + extraLen + size;
    }
    // central directory carries the same flag + bytes
    const eocdStart = zip.length - 22;
    const cdOffset = zip.readUInt32LE(eocdStart + 16);
    let cd = cdOffset;
    for (const name of names) {
      const cdFlags = zip.readUInt16LE(cd + 8);
      expect(cdFlags & 0x0800, `cd EFS ${name}`).toBe(0x0800);
      const nameLen = zip.readUInt16LE(cd + 28);
      const stored = zip.subarray(cd + 46, cd + 46 + nameLen).toString("utf8");
      expect(stored, `cd name ${name}`).toBe(name);
      const extraLen = zip.readUInt16LE(cd + 30);
      const commentLen = zip.readUInt16LE(cd + 32);
      cd = cd + 46 + nameLen + extraLen + commentLen;
    }
  });

  it("local headers: no data-descriptor flag, sizes written upfront (E.195)", () => {
    const zip = createZip([
      { name: "one.html", content: "hello world" },
      { name: "two.html", content: "second body" },
    ]);
    let off = 0;
    for (let i = 0; i < 2; i += 1) {
      const flags = zip.readUInt16LE(off + 6);
      // bit 3 (0x0008) = data descriptor — createZip sizes upfront,
      // so this must be OFF (streamed zips set it; naive parsers choke)
      expect(flags & 0x0008, `entry ${i} data-descriptor bit`).toBe(0);
      // compressed size present in the LOCAL header (not deferred)
      const csize = zip.readUInt32LE(off + 18);
      expect(csize, `entry ${i} local size`).toBeGreaterThan(0);
      const nameLen = zip.readUInt16LE(off + 26);
      const extraLen = zip.readUInt16LE(off + 28);
      off = off + 30 + nameLen + extraLen + csize;
    }
    // walked exactly into the central directory (local section complete)
    expect(zip.readUInt32LE(off)).toBe(0x02014b50);
  });
});
