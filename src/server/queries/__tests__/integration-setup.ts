/**
 * Integration test setup — creates a fresh in-memory SQLite DB using sql.js
 * (pure WASM, no native module) for each test file.
 *
 * This module mocks @/db to use a sql.js connection with drizzle-orm,
 * so the queries module talks to a real SQLite engine without needing
 * the broken better-sqlite3 native binary.
 */
import { vi } from "vitest";
import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { migrate } from "drizzle-orm/sql-js/migrator";
import * as path from "node:path";
import * as schema from "@/db/schema";

// Initialize sql.js (WASM) and create an in-memory database
const SQL = await initSqlJs();
const sqliteDb = new SQL.Database();

// Match production (src/db/index.ts): enforce FK constraints, otherwise a
// buggy write like sectionId=0 (#86) would slip through tests silently.
sqliteDb.run("PRAGMA foreign_keys = ON");

// Create drizzle instance with our schema
const db = drizzle(sqliteDb, { schema });

// Run migrations on the temp DB
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");
try {
  migrate(db, { migrationsFolder });
} catch {
  // If migrations fail, try reading and executing SQL files directly
  const fs = await import("node:fs");
  const files = fs.readdirSync(migrationsFolder).filter(f => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migrationsFolder, f), "utf-8");
    sqliteDb.run(sql);
  }
}

// Mock @/db so all queries go through our sql.js connection
vi.mock("@/db", () => ({ db, schema }));
// Mock the singleton that was already loaded
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => ({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 })),
  hashPassword: vi.fn(async (s: string) => `hashed-${s}`),
  verifyPassword: vi.fn(async () => true),
  createSession: vi.fn(async () => {}),
  destroySession: vi.fn(async () => {}),
}));

// #124: the capability gates resolve the session user's role ROW from the DB.
// Seed the admin (role text 'admin'; role_id NULL maps through the legacy
// text to ADMIN capabilities) so instance-level actions are authorized.
try {
  db.insert(schema.users).values({ username: "admin", passwordHash: "seed", role: "admin" }).run();
} catch {
  // already seeded (hot module reload)
}

// Re-export for use in tests
export { db, schema };

// ─── Seed helpers ─────────────────────────────────────────

export function seedPage(overrides: Partial<typeof schema.pages.$inferInsert> = {}) {
  return db
    .insert(schema.pages)
    .values({
      slug: "test-page",
      title: "Test Page",
      bio: "Test bio",
      isDefault: true,
      isPublished: true,
      socialLinks: "[]",
      ...overrides,
    })
    .returning()
    .get();
}

export function seedTheme(overrides: Partial<typeof schema.themes.$inferInsert> = {}) {
  return db
    .insert(schema.themes)
    .values({
      name: "Test Theme",
      isActive: true,
      isPreset: false,
      ...overrides,
    })
    .returning()
    .get();
}

export function seedLink(overrides: Partial<typeof schema.links.$inferInsert> = {}) {
  return db
    .insert(schema.links)
    .values({
      pageId: 1,
      title: "Test Link",
      url: "https://example.com",
      type: "url",
      orderIndex: 0,
      isActive: true,
      ...overrides,
    })
    .returning()
    .get();
}
