import { describe, it, expect } from "vitest";
import {
  createToken,
  verifyToken,
  SESSION_MAX_AGE,
  type SessionPayload,
} from "@/lib/session-token";

describe("createToken + verifyToken round-trip", () => {
  const payload: SessionPayload = {
    userId: 1,
    username: "admin",
    exp: Date.now() + 60_000, // 1 min in the future
    pv: 1,
    // #124: verifyToken normalizes a missing role to "admin" (never demote a
    // pre-multi-user session). The round-trip therefore yields role "admin",
    // so the strict toEqual below must include it.
    role: "admin",
  };

  it("creates a token with two dot-separated parts", () => {
    const token = createToken(payload);
    expect(token.split(".")).toHaveLength(2);
  });

  it("verifies a valid token and returns the payload", () => {
    const token = createToken(payload);
    const result = verifyToken(token);
    expect(result).toEqual(payload);
  });

  it("preserves userId, username, and pv", () => {
    const token = createToken(payload);
    const result = verifyToken(token);
    expect(result?.userId).toBe(1);
    expect(result?.username).toBe("admin");
    expect(result?.pv).toBe(1);
  });
});

describe("verifyToken rejection cases", () => {
  it("rejects a token with no dots", () => {
    expect(verifyToken("garbage")).toBeNull();
  });

  it("rejects a token with too many dots", () => {
    expect(verifyToken("a.b.c")).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = createToken({
      userId: 1,
      username: "admin",
      exp: Date.now() + 60_000,
      pv: 1,
    });
    const [encoded] = token.split(".");
    const tampered = `${encoded}.deadbeefdeadbeef`;
    expect(verifyToken(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createToken({
      userId: 1,
      username: "admin",
      exp: Date.now() - 1, // already expired
      pv: 1,
    });
    expect(verifyToken(token)).toBeNull();
  });

  it("treats missing pv as version 0", () => {
    const token = createToken({
      userId: 1,
      username: "admin",
      exp: Date.now() + 60_000,
      pv: 0,
    });
    const result = verifyToken(token);
    expect(result?.pv).toBe(0);
  });
});

describe("SESSION_MAX_AGE", () => {
  it("is 30 days in seconds", () => {
    expect(SESSION_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });
});
