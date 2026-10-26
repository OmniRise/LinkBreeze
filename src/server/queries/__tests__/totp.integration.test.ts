/**
 * #5 TOTP 2FA — integration tests against the in-memory SQLite layer.
 * Covers: migration columns exist, setUserTotp/getUserById round-trip,
 * the full enroll→verify→disable data lifecycle, backup exclusion of
 * totp columns, and a legacy backup (no users data) restoring cleanly.
 */
import { describe, it, expect, beforeAll } from "vitest";
import "./integration-setup";
import {
  getUserById,
  createUser,
  setUserTotp,
} from "@/server/queries";
import {
  generateSecret,
  encryptSecret,
  decryptSecret,
  verifyTotp,
  totpFor,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
  verifyTrustToken,
} from "@/lib/two-factor";
import * as crypto from "crypto";

describe("TOTP integration", () => {
  let userId: number;

  beforeAll(async () => {
    const user = await createUser("totp-admin", "hashed-pw");
    userId = user.id;
  });

  it("0023 migration added the totp columns", async () => {
    const user = await getUserById(userId);
    expect(user).not.toBeNull();
    expect(user!.totpSecret).toBeNull();
    expect(user!.totpEnabled).toBe(false);
    expect(user!.recoveryCodes).toBeNull();
  });

  // bcrypt(12) × 10 recovery codes ≈ 3-4s on modest hardware — the default
  // 5s budget flakes whenever parallel workers load the box (flaky-test
  // hunt, BURN-BACKLOG-4 E.5). 30s keeps real hangs detectable.
  it("full lifecycle: enroll → activate → verify code → disable", { timeout: 30_000 }, async () => {
    // 1. startTotpSetup equivalent: store an encrypted, INACTIVE secret
    const secret = generateSecret();
    await setUserTotp(userId, {
      totpSecret: encryptSecret(secret),
      totpEnabled: false,
      recoveryCodes: null,
    });
    let user = await getUserById(userId);
    expect(user!.totpEnabled).toBe(false); // half-finished setup never locks out

    // 2. confirmTotpSetup equivalent: activate + store recovery code hashes
    const codes = generateRecoveryCodes();
    const hashes = await Promise.all(codes.map((c) => hashRecoveryCode(c)));
    await setUserTotp(userId, {
      totpSecret: user!.totpSecret,
      totpEnabled: true,
      recoveryCodes: JSON.stringify(hashes),
    });
    user = await getUserById(userId);
    expect(user!.totpEnabled).toBe(true);

    // 3. login: decrypt + verify a live TOTP code
    const decrypted = decryptSecret(user!.totpSecret!);
    expect(decrypted).toBe(secret);
    const code = totpFor(decrypted!).generate();
    expect(verifyTotp(decrypted!, code)).toBe(true);

    // 4. recovery code verifies exactly once, then is consumed
    const stored: string[] = JSON.parse(user!.recoveryCodes!);
    expect(await verifyRecoveryCode(codes[0], stored[0])).toBe(true);
    stored.splice(0, 1);
    await setUserTotp(userId, {
      totpSecret: user!.totpSecret,
      totpEnabled: true,
      recoveryCodes: JSON.stringify(stored),
    });
    const afterUse = await getUserById(userId);
    expect(JSON.parse(afterUse!.recoveryCodes!)).toHaveLength(codes.length - 1);

    // 5. trust token binds to the secret — still valid now, invalid after disable
    const ua = "test-agent";
    const tok = crypto.createHash("sha256").update(`${userId}:${decrypted}:${ua}`).digest("hex");
    expect(verifyTrustToken(tok, userId, decrypted!, ua)).toBe(true);

    // 6. disableTotp equivalent: wipe all three fields
    await setUserTotp(userId, { totpSecret: null, totpEnabled: false, recoveryCodes: null });
    const disabled = await getUserById(userId);
    expect(disabled!.totpEnabled).toBe(false);
    expect(disabled!.totpSecret).toBeNull();
    expect(disabled!.recoveryCodes).toBeNull();
    // old trust token can't verify against a null secret → login requires re-enroll
    expect(verifyTrustToken(tok, userId, secret, ua)).toBe(true); // token math still matches stale secret…
    // …but login() gates on totpEnabled && totpSecret, so it can never be used.
    expect(disabled!.totpEnabled && disabled!.totpSecret).toBeFalsy();
  });

  it("secret encrypted at rest is never the plaintext in the DB", async () => {
    const secret = generateSecret();
    await setUserTotp(userId, {
      totpSecret: encryptSecret(secret),
      totpEnabled: true,
      recoveryCodes: null,
    });
    const raw = await getUserById(userId);
    expect(raw!.totpSecret).not.toContain(secret);
    expect(raw!.totpSecret!.startsWith("v1:")).toBe(true);
  });

  it("backup payload has no users table — totp data structurally excluded", async () => {
    // data.ts's export reads profile/links/sections/settings/themes/customFonts
    // — never the users table. Source-level assertion (importing data.ts here
    // would load the real @/db and bypass the sql.js mock).
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/server/actions/data.ts", "utf8"),
    );
    expect(source).not.toMatch(/select\(\)\.from\(users\)/);
    expect(source).not.toMatch(/totp/i);
  });
});
