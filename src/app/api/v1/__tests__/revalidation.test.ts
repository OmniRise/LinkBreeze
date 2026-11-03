/**
 * #4 E.24 — revalidation parity guard: every /api/v1 route that WRITES must
 * revalidate the public root ("/"), the same cross-cutting target the admin
 * actions always invalidate. Domain targets (/links, /profile) differ per
 * surface (documented in DESIGN-4.md), but "/" is the invariant — without
 * it, an API write can leave the public page stale in any setup where "/"
 * is cached.
 *
 * Detection is source-level (fs-walk, like the drift test): a route file
 * exporting POST/PUT/DELETE is a writer; read-only files are exempt.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROUTE_ROOT = path.join(process.cwd(), "src", "app", "api", "v1");
const WRITER_METHOD = /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

describe("E.24 revalidation parity", () => {
  const routes = walk(ROUTE_ROOT);

  it("finds the route surface (guards a broken walk)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(8);
  });

  it("every writer route revalidates the public root /", () => {
    const problems: string[] = [];
    let writers = 0;
    for (const file of routes) {
      const src = fs.readFileSync(file, "utf8");
      if (!WRITER_METHOD.test(src)) continue;
      writers += 1;
      if (!src.includes('revalidatePath("/")')) {
        problems.push(path.relative(ROUTE_ROOT, file));
      }
    }
    // links POST, links [id] PUT/DELETE, links reorder, links import,
    // sections POST, sections [id] PUT/DELETE, sections reorder, profile PUT.
    expect(writers).toBeGreaterThanOrEqual(8);
    expect(problems).toEqual([]);
  });

  it("read-only routes do not revalidate (they must stay side-effect free)", () => {
    const offenders: string[] = [];
    for (const file of routes) {
      const src = fs.readFileSync(file, "utf8");
      if (WRITER_METHOD.test(src)) continue;
      if (src.includes("revalidatePath(")) {
        offenders.push(path.relative(ROUTE_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
