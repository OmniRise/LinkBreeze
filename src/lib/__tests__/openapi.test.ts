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

describe("spec hygiene (E.19)", () => {
  type Doc = {
    openapi: string;
    info: { title: string; version: string; description: string };
    servers: unknown[];
    tags: Array<{ name: string }>;
    components: {
      securitySchemes: Record<string, unknown>;
      schemas: Record<string, unknown>;
    };
    security: Array<Record<string, unknown>>;
    paths: Record<string, Record<string, Record<string, unknown>>>;
  };
  const doc = buildOpenApiDocument() as Doc;
  const OPERATIONS = ["get", "post", "put", "patch", "delete", "head", "options"];
  const VALID_PARAM_IN = new Set(["query", "path", "header", "cookie"]);
  const declaredTags = new Set(doc.tags.map((t) => t.name));

  it("has every required top-level key with non-empty values", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("LinkBreeze API");
    expect(doc.info.version.length).toBeGreaterThan(0);
    expect(doc.info.description.length).toBeGreaterThan(20);
    expect(Array.isArray(doc.servers)).toBe(true);
    expect(doc.servers.length).toBeGreaterThan(0);
    expect(Object.keys(doc.paths).length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(doc.components.schemas).length).toBeGreaterThan(0);
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
  });

  it("documented version matches package.json", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { version: string };
    expect(doc.info.version).toBe(pkg.version);
  });

  it("every operation has summary + declared tags + a valid response key", () => {
    const problems: string[] = [];
    for (const [p, methods] of Object.entries(doc.paths)) {
      const ops = Object.entries(methods).filter(([m]) => OPERATIONS.includes(m));
      if (ops.length === 0) problems.push(`${p}: no operations`);
      for (const [method, op] of ops) {
        const where = `${method.toUpperCase()} ${p}`;
        if (typeof op.summary !== "string" || !op.summary.trim()) {
          problems.push(`${where}: missing summary`);
        }
        const tags = op.tags as string[] | undefined;
        if (!Array.isArray(tags) || tags.length === 0) {
          problems.push(`${where}: missing tags`);
        } else {
          for (const t of tags) {
            if (!declaredTags.has(t)) problems.push(`${where}: undeclared tag ${t}`);
          }
        }
        const responses = op.responses as Record<string, unknown> | undefined;
        const keys = responses ? Object.keys(responses) : [];
        if (keys.length === 0) problems.push(`${where}: no responses`);
        for (const k of keys) {
          if (k !== "default" && !/^[1-5]\d\d$/.test(k)) {
            problems.push(`${where}: bad status key ${k}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("path parameters are declared, in=path, required, and match the template", () => {
    const problems: string[] = [];
    for (const [p, methods] of Object.entries(doc.paths)) {
      const templateParams = [...p.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      for (const [method, op] of Object.entries(methods)) {
        if (!OPERATIONS.includes(method)) continue;
        const where = `${method.toUpperCase()} ${p}`;
        const params = (op.params ?? op.parameters) as
          | Array<Record<string, unknown>>
          | undefined;
        for (const name of templateParams) {
          const declared = (params ?? []).find(
            (prm) => prm.in === "path" && prm.name === name,
          );
          if (!declared) problems.push(`${where}: no path param ${name}`);
          else if (declared.required !== true) {
            problems.push(`${where}: path param ${name} not required`);
          }
        }
        for (const prm of params ?? []) {
          if (typeof prm.in !== "string" || !VALID_PARAM_IN.has(prm.in)) {
            problems.push(`${where}: bad param in=${String(prm.in)}`);
          }
          if (prm.in === "path" && prm.required !== true) {
            problems.push(`${where}: path param ${String(prm.name)} not required`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("every tag in the tag list is used by at least one operation (no dead tags)", () => {
    const used = new Set<string>();
    for (const methods of Object.values(doc.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (!OPERATIONS.includes(method)) continue;
        for (const t of (op.tags as string[] | undefined) ?? []) used.add(t);
      }
    }
    expect([...declaredTags].filter((t) => !used.has(t))).toEqual([]);
  });

  it("E.36: declares the real response headers per status", () => {
    type Resp = { headers?: Record<string, unknown> };
    const problems: string[] = [];
    for (const [p, methods] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (!OPERATIONS.includes(method)) continue;
        const where = `${method.toUpperCase()} ${p}`;
        const responses = (op.responses ?? {}) as Record<string, Resp>;
        const h = (s: string) => Object.keys(responses[s]?.headers ?? {});

        for (const s of ["400", "401", "403", "404", "429", "500", "304"]) {
          if (!responses[s]) continue;
          if (!h(s).includes("Cache-Control")) {
            problems.push(`${where}: ${s} missing Cache-Control`);
          }
        }
        for (const s of ["400", "403", "404", "500", "304", "200", "201"]) {
          if (!responses[s]) continue;
          // Docs' session-fallback 200 predates per-key accounting (spec says so).
          if (s === "200" && where === "GET /api/v1/docs") continue;
          if (!h(s).includes("X-RateLimit-Limit")) {
            problems.push(`${where}: ${s} missing X-RateLimit-Limit`);
          }
        }
        if (responses["401"] && !h("401").includes("WWW-Authenticate")) {
          problems.push(`${where}: 401 missing WWW-Authenticate`);
        }
        if (responses["429"] && !h("429").includes("Retry-After")) {
          problems.push(`${where}: 429 missing Retry-After`);
        }
        // Success 200s/201s declare Cache-Control everywhere (docs page too),
        // EXCEPT no rate headers where accounting hasn't run: docs session path.
        for (const s of ["200", "201"]) {
          if (!responses[s]) continue;
          if (!h(s).includes("Cache-Control")) {
            problems.push(`${where}: ${s} missing Cache-Control`);
          }
        }
        // Conditional reads must expose ETag on both 200 and 304.
        if (responses["304"] && !h("304").includes("ETag")) {
          problems.push(`${where}: 304 missing ETag`);
        }
        if (
          responses["304"] &&
          responses["200"] &&
          !h("200").includes("ETag")
        ) {
          problems.push(`${where}: conditional 200 missing ETag`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("E.58: servers stay relative (no basePath in next.config; proxy passes /api/* at root)", () => {
    // Multi-host self-hosted app: custom domains serve at root too, so "/"
    // resolves against the request origin everywhere. If basePath ever lands
    // in next.config, this flips and the spec (plus README links) must follow.
    expect(doc.servers).toEqual([{ url: "/" }]);
  });

  it("E.65: info carries the MIT SPDX license (spec is legally self-describing)", () => {
    const info = doc.info as {
      license?: { name?: string; identifier?: string };
    };
    expect(info.license?.identifier).toBe("MIT");
    expect(info.license?.name).toBe("MIT");
    // contact/externalDocs deliberately omitted: no stable public contact
    // channel is published by the repo (churn-prone data beats none).
  });

  it("E.63: every operation has a unique camelCase operationId (SDK generators key off them)", () => {
    const ids: string[] = [];
    for (const [p, methods] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (!OPERATIONS.includes(method)) continue;
        const id = (op as { operationId?: string }).operationId;
        expect(id, `${method.toUpperCase()} ${p}`).toBeTruthy();
        expect(id, `${method.toUpperCase()} ${p}`).toMatch(/^[a-z][a-zA-Z0-9]*$/);
        ids.push(id as string);
      }
    }
    expect(new Set(ids).size).toBe(ids.length); // globally unique
    expect(ids.length).toBe(18);
  });

  it("E.91: no orphan component schemas — every named schema is $ref'd somewhere", () => {
    const names = Object.keys(
      (doc as { components?: { schemas?: Record<string, unknown> } }).components?.schemas ?? {},
    );
    expect(names.length).toBeGreaterThan(0); // the component block exists
    const serialized = JSON.stringify(doc);
    for (const name of names) {
      // The name appears once as its definition key — require at least one
      // additional occurrence via a $ref, or the schema is dead weight.
      const needle = `#/components/schemas/${name}`;
      expect(
        serialized.split(needle).length - 1,
        `orphan schema (never $ref'd): ${name}`,
      ).toBeGreaterThan(0);
    }
  });

  it("E.99: info.description facts appear in the README API section (cross-artifact guard)", () => {
    const readme = fs.readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    const start = readme.indexOf("## 🔌 REST API");
    expect(start).toBeGreaterThan(-1);
    const section = readme.slice(start, readme.indexOf("\n## ", start));
    const description = (doc as { info: { description: string } }).info.description;

    // Every operational fact the spec states must also be promised to README
    // readers — and vice versa is guarded by keeping this list symmetric.
    const facts = [
      "X-RateLimit",
      "If-None-Match",
      "no-store",
      "120",
      "demo mode",
      "Bearer",
      "?cursor",
    ];
    for (const fact of facts) {
      expect(description, `info.description lost: ${fact}`).toContain(fact);
      expect(section, `README API section lost: ${fact}`).toContain(fact);
    }
  });

  it("E.84: README endpoints table maps 1:1 onto the spec (table ↔ operations)", () => {
    const readme = fs.readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    // Scope to the REST API section — other README tables are unrelated.
    const start = readme.indexOf("## 🔌 REST API");
    expect(start).toBeGreaterThan(-1);
    const rest = readme.slice(start);
    const section = rest.slice(0, rest.indexOf("\n## "));

    const rows: Array<[string, string]> = [];
    for (const m of section.matchAll(/^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)` \|/gm)) {
      rows.push([m[1], m[2]]);
    }
    expect(rows.length).toBe(15);

    const documented = new Set<string>();
    for (const [p, methods] of Object.entries(doc.paths)) {
      for (const method of Object.keys(methods)) {
        documented.add(`${method.toUpperCase()} ${p}`);
      }
    }
    // The three meta ops are documented in the section prose, not the table.
    const meta = new Set([
      "GET /api/v1/docs",
      "GET /api/v1/openapi",
      "GET /api/v1/openapi.json",
    ]);

    const fromTable = new Set(
      rows.map(([verb, p]) => `${verb} ${p.replace(/:([A-Za-z]+)/g, "{$1}")}`),
    );
    for (const key of fromTable) {
      expect(documented.has(key), `README row not in spec: ${key}`).toBe(true);
    }
    for (const key of documented) {
      expect(
        fromTable.has(key) || meta.has(key),
        `spec op missing from README table: ${key}`,
      ).toBe(true);
    }
  });
});
