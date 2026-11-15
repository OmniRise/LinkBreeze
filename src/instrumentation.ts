/**
 * Next.js Instrumentation — runs ONCE when the server boots, before any
 * request is served.
 *
 * Two responsibilities:
 *
 * 1. SECRET_KEY bootstrap. If the operator didn't set SECRET_KEY (very common
 *    with bare `docker run` — the docker-compose.yml sets it, but the
 *    ../docs/TROUBLESHOOTING.md `docker run` examples don't), generate a random key,
 *    persist it next to the SQLite database, and inject it into the process
 *    environment so every request that follows sees a stable secret. Without
 *    this, the very first login/setup crashes with a 500 because getSecret()
 *    throws in production mode.
 *
 * 2. Auto-run database migrations so that a fresh deploy (empty SQLite volume)
 *    has its tables created before the first query lands. Fixes the "no such
 *    table" crash on fresh `docker compose` / `docker run` deploys.
 *
 * Drizzle's migrate() is journaled in __drizzle_migrations, so migration is a
 * safe no-op on databases that are already up to date.
 */
export async function register() {
  // Only run in the Node.js runtime — skip the edge runtime entirely.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ── 1. Ensure SECRET_KEY is set before anything touches auth ─────────
  await ensureSecretKey();

  const [{ db, sqlite }, { migrate }, path] = await Promise.all([
    import("@/db"),
    import("drizzle-orm/better-sqlite3/migrator"),
    import("path"),
  ]);

  // Works in both runtimes:
  //  - standalone (node server.js): cwd is /app → /app/src/db/migrations
  //  - dev (next dev): cwd is the repo root → <repo>/src/db/migrations
  const migrationsFolder = path.join(
    process.cwd(),
    "src",
    "db",
    "migrations",
  );

  try {
    await repairMigrationTimestamps(migrationsFolder, sqlite);
    await migrate(db, { migrationsFolder });
    console.log("[migrate] database schema is up to date");
  } catch (err) {
    console.error("[migrate] FAILED to run database migrations:", err);
    throw err;
  }
}

/**
 * Self-healing migration-bookkeeping repair (guard against issue #79).
 *
 * Drizzle's migrator decides which journal entries to apply by comparing
 * each entry's `when` timestamp against ONLY the newest row in
 * __drizzle_migrations (`ORDER BY created_at DESC LIMIT 1`). If a journal
 * entry ever carries a `when` older than that row, the migrator silently
 * treats it as already-applied and skips it — the app then crashes on the
 * first query that touches the missing column.
 *
 * This happened in the wild: migrations 0005-0012 were hand-written with
 * 2025 dates while 0000-0004 were drizzle-kit-generated with real 2026
 * dates, so every upgraded install silently skipped 0010-0012 (#79).
 *
 * Repair strategy: BEFORE migrating, re-write each existing row's
 * created_at with the journal `when` of the entry whose sha256(sql-file)
 * matches the row's stored hash. Rows whose hash matches no journal entry
 * (e.g. a migration file edited after being applied) are left untouched.
 * After normalization the row sequence is strictly ascending, so:
 *   - nothing that already ran gets re-run (re-running would crash on
 *     CREATE UNIQUE INDEX), and
 *   - nothing that should run gets skipped.
 */
async function repairMigrationTimestamps(
  migrationsFolder: string,
  sqlite: import("better-sqlite3").Database,
): Promise<void> {
  const [{ createHash }, { readFileSync }] = await Promise.all([
    import("crypto"),
    import("fs"),
  ]);
  const { join } = await import("path");

  type Journal = { entries: { idx: number; tag: string; when: number }[] };
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as Journal;

  // hash(journal .sql file) → journal when
  const hashToWhen = new Map<string, number>();
  for (const entry of journal.entries) {
    const sql = readFileSync(join(migrationsFolder, `${entry.tag}.sql`), "utf8");
    hashToWhen.set(
      createHash("sha256").update(sql).digest("hex"),
      entry.when,
    );
  }

  // Direct SQL on the raw handle — the migrations table may not exist yet on
  // fresh installs (migrate() creates it moments later). Probe quietly.
  let rows: { hash: string; created_at: number }[];
  try {
    rows = sqlite.prepare("SELECT hash, created_at FROM __drizzle_migrations").all() as {
      hash: string;
      created_at: number;
    }[];
  } catch {
    return; // fresh install — nothing to repair
  }

  let repaired = 0;
  for (const row of rows) {
    const when = hashToWhen.get(row.hash);
    if (when !== undefined && Number(row.created_at) !== when) {
      sqlite
        .prepare("UPDATE __drizzle_migrations SET created_at = ? WHERE hash = ?")
        .run(when, row.hash);
      repaired++;
    }
  }
  if (repaired > 0) {
    console.log(
      `[migrate] repaired ${repaired} migration row timestamp(s) — normalized ` +
        "to journal order (issue #79 guard)",
    );
  }
}

/**
 * Guarantee that process.env.SECRET_KEY is set.
 *
 * Priority:
 *   1. Already set in the environment (docker-compose SECRET_KEY=, .env, etc.)
 *      → use as-is.
 *   2. A persisted key file exists at <data-dir>/.secret-key → load it.
 *   3. Neither → generate 32 random bytes (hex), persist to <data-dir>/.secret-key.
 *
 * The key file lives next to the SQLite database so it survives container
 * restarts as long as the volume is mounted. This makes LinkBreeze work
 * out-of-the-box with a bare `docker run` command — no SECRET_KEY needed.
 */
export async function ensureSecretKey(): Promise<void> {
  // If the operator provided a key, respect it and never override.
  if (process.env.SECRET_KEY) return;

  const [path, fs, crypto] = await Promise.all([
    import("path"),
    import("fs"),
    import("crypto"),
  ]);

  // Resolve the data directory from DATABASE_PATH (falls back to ./data).
  const dbPath =
    process.env.DATABASE_PATH || path.join(process.cwd(), "data", "linkbreeze.db");
  const dataDir = path.dirname(dbPath);
  const keyFile = path.join(dataDir, ".secret-key");

  try {
    // Try to read an existing key file (persisted from a previous boot).
    if (fs.existsSync(keyFile)) {
      const existing = fs.readFileSync(keyFile, "utf8").trim();
      if (existing.length >= 32) {
        process.env.SECRET_KEY = existing;
        return;
      }
    }
  } catch {
    // Read failed — fall through to generation.
  }

  // Generate a new key and persist it.
  const generated = crypto.randomBytes(32).toString("hex");
  try {
    // Ensure data dir exists (it should — db/index.ts creates it — but be safe).
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(keyFile, generated, { mode: 0o600 });
    console.log(
      `[auth] No SECRET_KEY found — generated and saved to ${keyFile}.\n` +
        "       For production deployments behind a reverse proxy, set a " +
        "fixed SECRET_KEY env var for reproducibility across rebuilds.",
    );
  } catch {
    // Can't persist (read-only volume?). Still inject into the process so the
    // current boot works; it just won't survive a container recreate.
    console.warn(
      `[auth] Could not persist SECRET_KEY to ${keyFile} (volume read-only?). ` +
        "Using an ephemeral key — sessions will not survive a restart.",
    );
  }
  process.env.SECRET_KEY = generated;
}
