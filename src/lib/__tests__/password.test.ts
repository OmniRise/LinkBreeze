import { describe, it, expect } from "vitest";
import * as bcrypt from "bcryptjs";
import {
  hashPassword,
  verifyPassword,
  isLegacyBcryptHash,
  ARGON2_OPTIONS,
} from "@/lib/password";

describe("hashPassword (Argon2id)", () => {
  it("produces an $argon2id$ hash with the OWASP parameters", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    const [, algorithm, version, params] = hash.split("$");
    expect(algorithm).toBe("argon2id");
    expect(version).toBe("v=19");
    expect(params).toBe(
      `m=${ARGON2_OPTIONS.memoryCost},t=${ARGON2_OPTIONS.timeCost},p=${ARGON2_OPTIONS.parallelism}`,
    );
  });

  it("round-trips a normal password", async () => {
    const hash = await hashPassword("s3cret-password");
    expect(await verifyPassword("s3cret-password", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("round-trips a multibyte password over 72 bytes", async () => {
    // 30 × 4-byte emoji = 120 bytes — far past bcrypt's 72-byte truncation
    // point. Argon2id must hash the FULL input.
    const password = "🚀".repeat(30);
    expect(Buffer.byteLength(password, "utf8")).toBeGreaterThan(72);
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it("distinguishes passwords that differ only after byte 72", async () => {
    // bcrypt truncates at 72 bytes and would treat these two as identical;
    // Argon2id must not.
    const a = "x".repeat(72) + "AAAA";
    const b = "x".repeat(72) + "BBBB";
    const hashA = await hashPassword(a);
    expect(await verifyPassword(a, hashA)).toBe(true);
    expect(await verifyPassword(b, hashA)).toBe(false);
  });
});

describe("verifyPassword prefix dispatch", () => {
  // bcrypt(12) in-test: 5s default can trip under full-suite parallel load
  // (this test failed once in a contended run; assertions are deterministic).
  it("verifies a legacy bcrypt hash", { timeout: 30_000 }, async () => {
    const legacy = await bcrypt.hash("old-bcrypt-pass", 12);
    expect(legacy.startsWith("$2a$") || legacy.startsWith("$2b$")).toBe(true);
    expect(await verifyPassword("old-bcrypt-pass", legacy)).toBe(true);
    expect(await verifyPassword("not-the-password", legacy)).toBe(false);
  });

  it("verifies a $2b$-prefixed hash", { timeout: 30_000 }, async () => {
    const legacy = (await bcrypt.hash("old-bcrypt-pass", 12)).replace(
      "$2a$",
      "$2b$",
    );
    expect(await verifyPassword("old-bcrypt-pass", legacy)).toBe(true);
  });

  it("verifies an Argon2id hash via the same entry point", async () => {
    const hash = await hashPassword("argon2-pass");
    expect(await verifyPassword("argon2-pass", hash)).toBe(true);
    expect(await verifyPassword("not-the-password", hash)).toBe(false);
  });

  it("rejects an unrecognised hash format without throwing", async () => {
    expect(await verifyPassword("whatever", "not-a-hash")).toBe(false);
    expect(await verifyPassword("whatever", "")).toBe(false);
    expect(await verifyPassword("whatever", "$clear$plaintext")).toBe(false);
  });
});

describe("isLegacyBcryptHash", () => {
  it.each(["$2a$12$abc", "$2b$12$abc", "$2y$12$abc"])(
    "flags legacy prefix %s",
    (hash) => {
      expect(isLegacyBcryptHash(hash)).toBe(true);
    },
  );

  it.each(["$argon2id$v=19$m=19456,t=2,p=1$abc", "plaintext", ""])(
    "does not flag %s",
    (hash) => {
      expect(isLegacyBcryptHash(hash)).toBe(false);
    },
  );
});
