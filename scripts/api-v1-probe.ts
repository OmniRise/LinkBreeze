/**
 * /api/v1 live-ish probe (#4, BURN-BACKLOG-4 3.2) — REAL better-sqlite3 DB
 * (throwaway file, migrated via drizzle), REAL modules, REAL crypto: creates
 * an API key through the same module the admin action uses, then invokes the
 * actual route handlers with real NextRequest objects and asserts the
 * envelope shapes end to end.
 *
 * Usage:
 *   DATABASE_PATH=/tmp/lb-api-probe/probe.db \
 *   UPLOAD_DIR=/tmp/lb-api-probe/uploads \
 *   npx tsx scripts/api-v1-probe.ts
 *
 * Refuses to run without an explicit DATABASE_PATH (never touch the dev DB).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import Module from "node:module";
import { NextRequest } from "next/server";

async function main() {
  // 'server-only' is a Next-internal alias (the package is never installed);
  // vitest maps it to the same empty stub (vitest.config.ts) — mirror that
  // resolution here so plain tsx can load the real modules. `next/cache`'s
  // revalidatePath needs the Next runtime's static-generation store, so it
  // gets a pass-through stub (see scripts/__probe_stubs__/next-cache.cjs).
  type Resolver = (request: string, ...rest: unknown[]) => string;
  const mod = Module as unknown as { _resolveFilename: Resolver };
  const originalResolve = mod._resolveFilename;
  mod._resolveFilename = (request, ...rest) => {
    const g = globalThis as { __LB_PROBE_REAL_CACHE?: boolean };
    if (request === "server-only") {
      return path.join(process.cwd(), "src", "__mocks__", "empty.ts");
    }
    if (request === "next/cache" && !g.__LB_PROBE_REAL_CACHE) {
      return path.join(process.cwd(), "scripts", "__probe_stubs__", "next-cache.cjs");
    }
    return originalResolve(request, ...rest);
  };

  const dbPath = process.env.DATABASE_PATH;
  if (!dbPath) {
    console.error("DATABASE_PATH is required (use a throwaway file).");
    process.exit(2);
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(process.env.UPLOAD_DIR || path.join(path.dirname(dbPath), "uploads"), {
    recursive: true,
  });
  // Stale WAL siblings over a fresh file make drizzle's boot migrate die with
  // SQLITE_IOERR_SHORT_READ (skill gotcha) — start clean every run.
  for (const sibling of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    fs.rmSync(sibling, { force: true });
  }

  // Imports that touch @/db MUST come after the env is in place.
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { db } = await import("../src/db");
  const { createApiKey } = await import("../src/server/api-keys");
  const { getAllLinks } = await import("../src/server/queries");

  migrate(db, { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });

  const linksRoute = await import("../src/app/api/v1/links/route");
  const linkIdRoute = await import("../src/app/api/v1/links/[id]/route");
  const profileRoute = await import("../src/app/api/v1/profile/route");
  const analyticsRoute = await import("../src/app/api/v1/analytics/route");
  const openapiRoute = await import("../src/app/api/v1/openapi/route");

  const { key } = await createApiKey();

  let ipCounter = 0;
  const req = (method: string, body?: unknown, auth = true): NextRequest => {
    ipCounter += 1;
    const headers: Record<string, string> = { "x-forwarded-for": `10.50.0.${ipCounter}` };
    if (auth) headers.authorization = `Bearer ${key}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    return new NextRequest("http://localhost:3000/api/v1/links", {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  };

  const results: Array<{ step: string; ok: boolean; detail: string }> = [];
  const check = (step: string, ok: boolean, detail: string) => {
    results.push({ step, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${step}  ${detail}`);
  };

  check("createApiKey", /^lbk_[A-Za-z0-9_-]{43}$/.test(key), "plaintext issued once, shaped key");

  // 1. auth reject on the real handler
  const denied = await linksRoute.GET(req("GET", undefined, false));
  const deniedBody = await denied.json();
  check(
    "GET /links unauthenticated",
    denied.status === 401 && deniedBody.error?.code === "unauthorized",
    `status=${denied.status} code=${deniedBody.error?.code}`,
  );

  // 2. create through the real handler (queries hit the migrated file DB)
  let revalidateBroken: string | null = null;
  const invoke = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (err) {
      revalidateBroken = err instanceof Error ? err.message : String(err);
      return null;
    }
  };

  const created = await invoke(() =>
    linksRoute.POST(
      req("POST", { title: "Probe link", url: "https://probe.example", redirectSlug: "probe-slug" }),
    ),
  );
  let createdId: number | null = null;
  if (created) {
    const body = (await created.json()) as { data?: { id?: number; title?: string } };
    createdId = body.data?.id ?? null;
    check(
      "POST /links create",
      created.status === 201 && body.data?.title === "Probe link" && createdId !== null,
      `status=${created.status} id=${createdId}`,
    );
  } else {
    check("POST /links create", false, `handler threw: ${revalidateBroken}`);
  }

  // 3. the write is REAL: visible through the queries layer (no handler involved)
  const rows = await getAllLinks();
  check(
    "DB persistence (queries layer)",
    rows.some((r) => r.title === "Probe link"),
    `links in db=${rows.length}`,
  );

  if (created && createdId !== null) {
    const linkId = createdId;

    const updated = await invoke(() =>
      linkIdRoute.PUT(req("PUT", { title: "Probe link v2" }), {
        params: Promise.resolve({ id: String(linkId) }),
      }),
    );
    if (updated) {
      const body = await updated.json();
      check(
        "PUT /links/:id partial update",
        updated.status === 200 && body.data?.title === "Probe link v2",
        `status=${updated.status} title=${body.data?.title}`,
      );
    } else {
      check("PUT /links/:id partial update", false, `handler threw: ${revalidateBroken}`);
    }

    const analytics = await analyticsRoute.GET(req("GET"));
    const analyticsBody = await analytics.json();
    check(
      "GET /analytics shape",
      analytics.status === 200 &&
        typeof analyticsBody.data?.retentionDays === "number" &&
        typeof analyticsBody.data?.exportedAt === "string",
      `status=${analytics.status} range=${analyticsBody.data?.range}`,
    );

    const openapi = await openapiRoute.GET(req("GET"));
    const doc = await openapi.json();
    check(
      "GET /openapi document",
      openapi.status === 200 && doc.openapi === "3.1.0",
      `status=${openapi.status} paths=${Object.keys(doc.paths ?? {}).length}`,
    );

    const removed = await invoke(() =>
      linkIdRoute.DELETE(req("DELETE"), { params: Promise.resolve({ id: String(linkId) }) }),
    );
    if (removed) {
      check("DELETE /links/:id", removed.status === 200, `status=${removed.status}`);
    } else {
      check("DELETE /links/:id", false, `handler threw: ${revalidateBroken}`);
    }
  }

  // 4. profile 404 on a fresh instance (honest envelope, not a crash)
  const profile = await profileRoute.GET(req("GET"));
  const profileBody = await profile.json();
  check(
    "GET /profile (empty instance)",
    profile.status === 404 && profileBody.error?.code === "not_found",
    `status=${profile.status} code=${profileBody.error?.code}`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\nprobe summary: ${results.length - failed.length}/${results.length} passed` +
      (revalidateBroken ? ` (revalidatePath note: ${revalidateBroken})` : ""),
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
