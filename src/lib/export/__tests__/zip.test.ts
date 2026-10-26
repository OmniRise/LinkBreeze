import { describe, it, expect } from "vitest";
import { crc32 } from "node:zlib";
import { createZip, dedupeNames, type ZipEntry } from "@/lib/export/zip";

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
});
