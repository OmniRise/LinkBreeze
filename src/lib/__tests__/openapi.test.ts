/**
 * #4 — OpenAPI drift test: exact set-equality between the spec document
 * (src/lib/openapi.ts) and the REAL router table (every route.ts under
 * src/app/api/v1, including re-exported handlers). Both directions:
 *   - every documented path+method exists as a route
 *   - every route path+method is documented
 * Plus: every internal $ref resolves, and the security scheme is declared.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildOpenApiDocument } from "@/lib/openapi";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

/** Walk src/app/api/v1 for route.ts files and extract their handlers. */
function collectRouterTable(): Set<string> {
  const root = path.join(process.cwd(), "src", "app", "api", "v1");
  const out = new Set<string>();

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name !== "route.ts") continue;

      // File path → URL path: [id] → {id}, openapi.json stays literal.
      const rel = path.relative(root, path.dirname(full));
      const segments = rel.split(path.sep).filter(Boolean).map((s) =>
        s.startsWith("[") && s.endsWith("]") ? `{${s.slice(1, -1)}}` : s,
      );
      const urlPath = ["/api/v1", ...segments].join("/");

      const source = fs.readFileSync(full, "utf8");
      for (const method of HTTP_METHODS) {
        // Direct handler export: `export async function GET(`
        if (new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`).test(source)) {
          out.add(`${method} ${urlPath}`);
        }
        // Re-export from a sibling route: `export { GET } from ...`
        const reExport = new RegExp(`export\\s*{([^}]*)}\\s*from`).exec(source);
        if (reExport) {
          for (const name of reExport[1].split(",").map((s) => s.trim())) {
            if (name === method) out.add(`${method} ${urlPath}`);
          }
        }
      }
    }
  };

  walk(root);
  return out;
}

/** Every "METHOD /path" the spec documents. */
function collectSpecTable(): Set<string> {
  const doc = buildOpenApiDocument() as {
    paths: Record<string, Record<string, unknown>>;
  };
  const out = new Set<string>();
  for (const [p, ops] of Object.entries(doc.paths)) {
    for (const method of Object.keys(ops)) {
      if ((HTTP_METHODS as readonly string[]).includes(method.toUpperCase())) {
        out.add(`${method.toUpperCase()} ${p}`);
      }
    }
  }
  return out;
}

describe("OpenAPI document (#4)", () => {
  it("is a structurally valid 3.1 doc with a bearer security scheme", () => {
    const doc = buildOpenApiDocument() as {
      openapi: string;
      info: { title: string };
      components: { securitySchemes: Record<string, unknown> };
      security: unknown[];
    };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("LinkBreeze API");
    expect(doc.components.securitySchemes.bearerAuth).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "lbk_*",
    });
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
  });

  it("resolves every internal $ref", () => {
    const doc = buildOpenApiDocument() as Record<string, unknown>;
    const refs: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
          if (k === "$ref" && typeof v === "string") refs.push(v);
          else walk(v);
        }
      }
    };
    walk(doc);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.startsWith("#/")).toBe(true);
      let cursor: unknown = doc;
      for (const token of ref.slice(2).split("/")) {
        expect(cursor && typeof cursor === "object").toBe(true);
        cursor = (cursor as Record<string, unknown>)[token];
      }
      expect(cursor, `unresolved $ref: ${ref}`).toBeDefined();
    }
  });

  it("matches the router table exactly (no drift, both directions)", () => {
    const router = collectRouterTable();
    const spec = collectSpecTable();

    const undocumented = [...router].filter((x) => !spec.has(x)).sort();
    const phantom = [...spec].filter((x) => !router.has(x)).sort();

    expect(undocumented, "routes missing from the spec").toEqual([]);
    expect(phantom, "spec paths with no matching route").toEqual([]);

    // Sanity: the walk found the expected surface (guards a broken walk).
    expect(router.size).toBeGreaterThanOrEqual(10);
  });
});
