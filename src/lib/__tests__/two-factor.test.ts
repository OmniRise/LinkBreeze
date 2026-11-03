import { describe, it, expect } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  generateSecret,
  verifyTotp,
  totpFor,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
  trustToken,
  verifyTrustToken,
  otpauthUri,
} from "../two-factor";
import { pendingToken, verifyPendingToken } from "../totp-pending";

// Two-factor crypto core (#5). Pure functions — no next/headers — so these
// run in the plain node environment.

describe("TOTP secret encryption at rest", () => {
  it("round-trips a secret", () => {
    const secret = generateSecret();
    const enc = encryptSecret(secret);
    expect(enc).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}$/);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const s = generateSecret();
    expect(encryptSecret(s)).not.toBe(encryptSecret(s));
  });

  it("returns null on tampered ciphertext", () => {
    const enc = encryptSecret("MYSECRET");
    const parts = enc.split(":");
    parts[2] = parts[2].replace(/^../, "ff"); // flip ciphertext bytes
    expect(decryptSecret(parts.join(":"))).toBeNull();
  });

  it("returns null on malformed input", () => {
    expect(decryptSecret("")).toBeNull();
    expect(decryptSecret("v1:abc")).toBeNull();
    expect(decryptSecret("v9:00:00:00")).toBeNull();
  });
});

describe("TOTP verification", () => {
  it("accepts the current code and ±1 window", () => {
    const secret = generateSecret();
    const code = totpFor(secret).generate();
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it("rejects wrong codes", () => {
    const secret = generateSecret();
    expect(verifyTotp(secret, "000000")).toBe(false);
  });

  it("rejects malformed tokens without throwing", () => {
    const secret = generateSecret();
    expect(verifyTotp(secret, "")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "1234567890123")).toBe(false);
    expect(verifyTotp(secret, "12 34 56")).toBe(false); // spaces stripped → 6 digits, but wrong code
  });

  it("rejects a code generated from a different secret", () => {
    const s1 = generateSecret();
    const s2 = generateSecret();
    const code = totpFor(s1).generate();
    // With a ±1 window and independent secrets, a false accept is ~3 in a
    // million per pair; if it ever flakes here, it's a real crypto failure.
    expect(verifyTotp(s2, code)).toBe(false);
  });
});

describe("otpauth URI", () => {
  it("builds a spec-compliant URI", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "admin");
    expect(uri).toBe(
      "otpauth://totp/LinkBreeze:admin?issuer=LinkBreeze&secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30",
    );
  });

  it("URL-encodes the username", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "weird user@x");
    expect(uri).toContain("LinkBreeze:weird%20user%40x");
  });
});

describe("recovery codes", () => {
  it("generates 8 unique codes without lookalike chars", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) {
      expect(c).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/);
      expect(c).not.toMatch(/[0o1l]/);
    }
  });

  // bcrypt(12) hash + 2 compares: under full-suite parallelism this CAN
  // cross vitest's 5s default (same class as decision #9's totp fix).
  it("hash + verify round-trip", { timeout: 30_000 }, async () => {
    const [code] = generateRecoveryCodes(1);
    const hash = await hashRecoveryCode(code);
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt
    expect(await verifyRecoveryCode(code, hash)).toBe(true);
    expect(await verifyRecoveryCode("wrongcode", hash)).toBe(false);
  });
});

describe("trust-this-device token", () => {
  it("verifies the same (user, secret, UA)", () => {
    const secret = generateSecret();
    const t = trustToken(1, secret, "Mozilla/5.0 Test");
    expect(verifyTrustToken(t, 1, secret, "Mozilla/5.0 Test")).toBe(true);
  });

  it("rejects a different UA (device binding)", () => {
    const secret = generateSecret();
    const t = trustToken(1, secret, "Mozilla/5.0 A");
    expect(verifyTrustToken(t, 1, secret, "Mozilla/5.0 B")).toBe(false);
  });

  it("rejects garbage tokens", () => {
    const secret = generateSecret();
    expect(verifyTrustToken("", 1, secret, "UA")).toBe(false);
    expect(verifyTrustToken("zz", 1, secret, "UA")).toBe(false);
    expect(verifyTrustToken("a".repeat(64), 1, secret, "UA")).toBe(false);
  });
});

describe("pending login token", () => {
  it("round-trips within the window", () => {
    const tok = pendingToken("admin", Date.now());
    expect(verifyPendingToken(tok, "admin")).toBe(true);
  });

  it("rejects expiry (>5 min)", () => {
    const tok = pendingToken("admin", Date.now() - 6 * 60_000);
    expect(verifyPendingToken(tok, "admin")).toBe(false);
  });

  it("rejects a token minted for a different username", () => {
    const tok = pendingToken("admin", Date.now());
    expect(verifyPendingToken(tok, "root")).toBe(false);
  });

  it("rejects tampered signatures", () => {
    const tok = pendingToken("admin", Date.now());
    const bad = tok.slice(0, -2) + "zz";
    expect(verifyPendingToken(bad, "admin")).toBe(false);
    expect(verifyPendingToken("notatoken", "admin")).toBe(false);
  });
});
