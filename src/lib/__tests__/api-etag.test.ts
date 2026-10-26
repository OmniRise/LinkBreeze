/**
 * #4 E.8 — pure ETag helpers: determinism, change detection, format, and
 * RFC 9110 If-None-Match evaluation (*, weak, lists, garbage).
 */
import { describe, it, expect } from "vitest";
import { etagFor, etagNotModified } from "@/lib/api-etag";

describe("etagFor", () => {
  it("is deterministic and a quoted 32-hex strong validator", () => {
    const payload = { data: [{ id: 1, title: "One" }] };
    const a = etagFor(payload);
    const b = etagFor({ data: [{ id: 1, title: "One" }] });
    expect(a).toBe(b);
    expect(a).toMatch(/^"[0-9a-f]{32}"$/);
  });

  it("changes when any part of the payload changes (including key order)", () => {
    const base = etagFor({ data: [1, 2], meta: { count: 2 } });
    expect(etagFor({ data: [1, 3], meta: { count: 2 } })).not.toBe(base);
    expect(etagFor({ data: [1, 2], meta: { count: 3 } })).not.toBe(base);
    expect(etagFor({ meta: { count: 2 }, data: [1, 2] })).not.toBe(base);
    expect(etagFor({ data: [1, 2] })).not.toBe(base);
  });

  it("matches the actual serialization our responses send", () => {
    // The route passes { data, meta? } straight into NextResponse.json —
    // hashing JSON.stringify of the same object is byte-identical by
    // construction (property order = insertion order).
    const body = { data: [{ id: 7 }], meta: { count: 1, nextCursor: null } };
    expect(etagFor(body)).toBe(etagFor(JSON.parse(JSON.stringify(body))));
  });
});

describe("etagNotModified", () => {
  const tag = '"abc123def456"';

  it("false on missing/empty headers", () => {
    expect(etagNotModified(null, tag)).toBe(false);
    expect(etagNotModified(undefined, tag)).toBe(false);
    expect(etagNotModified("", tag)).toBe(false);
    expect(etagNotModified("   ", tag)).toBe(false);
  });

  it("exact match", () => {
    expect(etagNotModified('"abc123def456"', tag)).toBe(true);
    expect(etagNotModified('"other"', tag)).toBe(false);
  });

  it("weak prefix is ignored on both sides (weak comparison)", () => {
    expect(etagNotModified('W/"abc123def456"', tag)).toBe(true);
    expect(etagNotModified(`W/${tag}`, tag)).toBe(true);
    expect(etagNotModified(tag, `W/${tag}`)).toBe(true);
  });

  it("supports comma-separated lists and *", () => {
    expect(etagNotModified(`"x", "y", ${tag}`, tag)).toBe(true);
    expect(etagNotModified(`"x",${tag},"z"`, tag)).toBe(true);
    expect(etagNotModified("*", tag)).toBe(true);
    expect(etagNotModified(`"x", "y"`, tag)).toBe(false);
  });

  it("never crashes on hostile values", () => {
    expect(etagNotModified('W/', tag)).toBe(false);
    expect(etagNotModified(",", tag)).toBe(false);
    expect(etagNotModified('not-a-tag', tag)).toBe(false);
    expect(etagNotModified(`"${'a'.repeat(10000)}"`, tag)).toBe(false);
  });
});
