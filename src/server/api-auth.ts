/**
 * /api/v1 request gate (#4) — shared auth + rate-limit + envelope helpers
 * for every public REST route.
 *
 * Order per request (DESIGN-4.md):
 *   1. body cap (mutating routes — route handlers parse JSON themselves)
 *   2. per-IP pre-auth limit (protects the key-hash lookup from hammering)
 *   3. Authorization: Bearer <key> → hash → constant-time compare (401)
 *   4. per-key limit (X-RateLimit-* headers; 429 + Retry-After)
 *   5. demo guard (mutating routes → 403)
 *
 * Every reject is the SAME error envelope; a missing key, a malformed header
 * and an unknown/revoked key are indistinguishable by design.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  apiKeyMatches,
  isApiKeyShaped,
  parseBearerToken,
  rateLimitBucketKey,
  isPrevKeyLive,
} from "@/lib/api-key";
import { getApiKeyRecord, recordApiKeyUsed } from "@/server/api-keys";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { demoBlock } from "@/lib/demo";
import { ErrorCode } from "@/lib/errors";

// ── Tunables (DESIGN-4.md) ─────────────────────────────────────────────

/** Per-key fixed window. Machine traffic: generous but bounded. */
export const API_KEY_RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const;
/** Pre-auth per-IP window (unknown-key hammering never reaches the DB). */
export const API_IP_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
/** JSON bodies above this are rejected before parsing. */
export const API_BODY_LIMIT_BYTES = 64 * 1024;

// ── Envelope helpers ───────────────────────────────────────────────────

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Array<{ path: string; message: string }> };
}

/** Build the canonical v1 error response. `code` is an ErrorCode string. */
export function apiError(
  code: string,
  message: string,
  status: number,
  opts?: {
    details?: Array<{ path: string; message: string }>;
    headers?: Record<string, string>;
  },
): NextResponse {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(opts?.details ? { details: opts.details } : {}),
    },
  };
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(opts?.headers ?? {}),
    },
  });
}

/** Canonical v1 success response: `{ "data": ... }` (paginated endpoints add
 *  `{ meta }` alongside — see E.3). */
export function apiOk(
  data: unknown,
  init?: { status?: number; headers?: Record<string, string>; meta?: Record<string, unknown> },
): NextResponse {
  return NextResponse.json(
    init?.meta ? { data, meta: init.meta } : { data },
    {
      status: init?.status ?? 200,
      headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
    },
  );
}

/** Machine-readable codes: the ONE vocabulary from src/lib/errors.ts, so the
 *  REST API and the admin UI can never drift apart. */
export { ErrorCode };

// ── Gate ───────────────────────────────────────────────────────────────

export interface ApiContext {
  /** sha256 hex of the authenticated key — the rate-limit identity. */
  keyHash: string;
}

export type ApiGateResult =
  | { ok: true; ctx: ApiContext; rateHeaders: Record<string, string> }
  | { ok: false; response: NextResponse };

/** First X-Forwarded-For hop, matching every existing route's convention. */
export function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function rateHeaders(rl: RateLimitResult, limit: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
  };
}

function rateLimitedResponse(rl: RateLimitResult): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
  return apiError(ErrorCode.RATE_LIMIT, "Too many requests.", 429, {
    headers: { "Retry-After": String(retryAfter) },
  });
}

/**
 * Authenticate + rate-limit a v1 request. Returns the api context or a ready
 * error response. Mutating routes pass `{ mutating: true }` to get the body
 * cap and demo guard as well.
 */
export async function apiGate(
  request: NextRequest,
  opts?: { mutating?: boolean },
): Promise<ApiGateResult> {
  const mutating = opts?.mutating === true;

  // 1. Body cap — content-length only (same pattern as the themes import).
  if (mutating) {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > API_BODY_LIMIT_BYTES) {
      return {
        ok: false,
        response: apiError(ErrorCode.VALIDATION, "Request body too large.", 413),
      };
    }
  }

  // 2. Per-IP pre-auth limit.
  const ipRl = rateLimit(
    `api:v1:ip:${clientIp(request)}`,
    API_IP_RATE_LIMIT.limit,
    API_IP_RATE_LIMIT.windowMs,
  );
  if (!ipRl.ok) {
    return { ok: false, response: rateLimitedResponse(ipRl) };
  }

  // 3. Bearer parse (malformed header → same 401 as unknown key).
  const presented = parseBearerToken(request.headers.get("authorization"));
  if (!presented || !isApiKeyShaped(presented)) {
    return {
      ok: false,
      response: apiError(
        ErrorCode.UNAUTHORIZED,
        "Missing or invalid API key.",
        401,
        { headers: { "WWW-Authenticate": "Bearer" } },
      ),
    };
  }

  const record = await getApiKeyRecord();
  const presentedHashMatch = record ? apiKeyMatches(presented, record.hash) : false;
  // E.2 rotation grace: the PREVIOUS key lives until its window closes.
  const prevLiveMatch =
    !presentedHashMatch &&
    record !== null &&
    isPrevKeyLive(record) &&
    record.prevHash !== null &&
    apiKeyMatches(presented, record.prevHash);
  if (!record || (!presentedHashMatch && !prevLiveMatch)) {
    return {
      ok: false,
      response: apiError(
        ErrorCode.UNAUTHORIZED,
        "Missing or invalid API key.",
        401,
        { headers: { "WWW-Authenticate": "Bearer" } },
      ),
    };
  }

  // 4. Per-key limit.
  const keyRl = rateLimit(
    rateLimitBucketKey(record.hash),
    API_KEY_RATE_LIMIT.limit,
    API_KEY_RATE_LIMIT.windowMs,
  );
  const headers = rateHeaders(keyRl, API_KEY_RATE_LIMIT.limit);
  if (!keyRl.ok) {
    const res = rateLimitedResponse(keyRl);
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
    return { ok: false, response: res };
  }

  // Successful auth — best-effort last-used bookkeeping (throttled).
  await recordApiKeyUsed(record.lastUsedAt);

  // 5. Demo guard for mutations.
  if (mutating) {
    const demo = demoBlock();
    if (demo) {
      return {
        ok: false,
        response: apiError(ErrorCode.DEMO, demo, 403),
      };
    }
  }

  return { ok: true, ctx: { keyHash: record.hash }, rateHeaders: headers };
}

/** Parse a JSON body with the shared size cap already enforced upstream.
 *  Returns null when the body is not valid JSON (caller → 400). */
export async function parseJsonBody<T = unknown>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
