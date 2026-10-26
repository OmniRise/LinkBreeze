/**
 * Minimal ZIP writer for the batch static export (#80, E.1).
 *
 * Store-only (method 0, no compression): the entries are HTML documents
 * that gzip well at the transport layer anyway, and a dependency-free
 * writer is ~80 lines versus adding archiver/jszip for one feature. CRC-32
 * comes from node:zlib (standard check value verified in tests).
 *
 * Pure module: no @/db, deterministic given a fixed timestamp — unit
 * testable by parsing the produced bytes.
 */

import { crc32 } from "node:zlib";

export interface ZipEntry {
  /** File name inside the archive (no directories needed for our use). */
  name: string;
  /** Text (UTF-8 encoded) or raw binary content. */
  content: string | Buffer;
}

/** Fixed epoch for deterministic archives in tests (2026-01-01 00:00:00 UTC). */
const DOS_EPOCH = { date: (2026 - 1980) << 9 | 1 << 5 | 1, time: 0 };

const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;

function localHeader(nameBytes: Buffer, crc: number, size: number, dosDate: number, dosTime: number): Buffer {
  const buf = Buffer.alloc(30 + nameBytes.length);
  buf.writeUInt32LE(0x04034b50, 0); // local file header signature
  buf.writeUInt16LE(20, 4); // version needed
  buf.writeUInt16LE(FLAG_UTF8, 6);
  buf.writeUInt16LE(METHOD_STORE, 8);
  buf.writeUInt16LE(dosTime, 10);
  buf.writeUInt16LE(dosDate, 12);
  buf.writeUInt32LE(crc >>> 0, 14);
  buf.writeUInt32LE(size, 18); // compressed size
  buf.writeUInt32LE(size, 22); // uncompressed size
  buf.writeUInt16LE(nameBytes.length, 26);
  buf.writeUInt16LE(0, 28); // extra field length
  nameBytes.copy(buf, 30);
  return buf;
}

function centralHeader(
  nameBytes: Buffer,
  crc: number,
  size: number,
  dosDate: number,
  dosTime: number,
  offset: number,
): Buffer {
  const buf = Buffer.alloc(46 + nameBytes.length);
  buf.writeUInt32LE(0x02014b50, 0); // central directory signature
  buf.writeUInt16LE(20, 4); // version made by
  buf.writeUInt16LE(20, 6); // version needed
  buf.writeUInt16LE(FLAG_UTF8, 8);
  buf.writeUInt16LE(METHOD_STORE, 10);
  buf.writeUInt16LE(dosTime, 12);
  buf.writeUInt16LE(dosDate, 14);
  buf.writeUInt32LE(crc >>> 0, 16);
  buf.writeUInt32LE(size, 20);
  buf.writeUInt32LE(size, 24);
  buf.writeUInt16LE(nameBytes.length, 28);
  buf.writeUInt16LE(0, 30); // extra length
  buf.writeUInt16LE(0, 32); // comment length
  buf.writeUInt16LE(0, 34); // disk number start
  buf.writeUInt16LE(0, 36); // internal attributes
  buf.writeUInt32LE(0, 38); // external attributes
  buf.writeUInt32LE(offset, 42); // local header offset
  nameBytes.copy(buf, 46);
  return buf;
}

function eocd(count: number, cdSize: number, cdOffset: number): Buffer {
  const buf = Buffer.alloc(22);
  buf.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  buf.writeUInt16LE(0, 4); // disk number
  buf.writeUInt16LE(0, 6); // central directory start disk
  buf.writeUInt16LE(count, 8);
  buf.writeUInt16LE(count, 10);
  buf.writeUInt32LE(cdSize, 12);
  buf.writeUInt32LE(cdOffset, 16);
  buf.writeUInt16LE(0, 20); // comment length
  return buf;
}

/**
 * Dedupe archive entry names: "a.html", "a.html" → "a.html", "a-2.html".
 * Two pages can sanitize to the same download filename (slugs differing
 * only in stripped characters); the archive must never silently overwrite.
 */
export function dedupeNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n === 0) return name;
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    return `${stem}-${n + 1}${ext}`;
  });
}

/**
 * Build a store-only zip archive from the given entries. Names must not
 * contain path separators (callers sanitize); duplicates are handled by
 * the caller (see dedupeNames + the route).
 */
export function createZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, "utf8");
    const crc = crc32(data);
    const header = localHeader(nameBytes, crc, data.length, DOS_EPOCH.date, DOS_EPOCH.time);
    locals.push(header, data);
    centrals.push(
      centralHeader(nameBytes, crc, data.length, DOS_EPOCH.date, DOS_EPOCH.time, offset),
    );
    offset += header.length + data.length;
  }

  const cd = Buffer.concat(centrals);
  return Buffer.concat([...locals, cd, eocd(entries.length, cd.length, offset)]);
}
