/**
 * GET /api/v1/docs (#4) — minimal, dependency-free HTML reference rendered
 * server-side from the OpenAPI builder (single source: spec and docs can
 * never drift).
 *
 * Auth: an API key (Bearer) passes like everywhere else, AND an admin
 * SESSION also opens it — a browser cannot attach an Authorization header
 * to a plain page load, so session-auth keeps the page viewable where the
 * operator is already logged in. Both paths are full admin equivalents;
 * anonymous access is refused with the standard 401 envelope.
 */
import { NextRequest, NextResponse } from "next/server";
import { apiGate } from "@/server/api-auth";
import { getSession } from "@/lib/auth";
import { buildOpenApiDocument } from "@/lib/openapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDocs(): string {
  const doc = buildOpenApiDocument() as {
    info: { title: string; version: string; description: string };
    paths: Record<string, Record<string, { summary?: string; tags?: string[] }>>;
  };

  const rows: string[] = [];
  for (const [path, ops] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      rows.push(
        `<tr><td><code>${escapeHtml(method.toUpperCase())}</code></td>` +
          `<td><code>${escapeHtml(path)}</code></td>` +
          `<td>${escapeHtml(op.summary ?? "")}</td></tr>`,
      );
    }
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(doc.info.title)} - docs</title>
<style>
  body { font: 15px/1.55 system-ui, sans-serif; margin: 2rem auto; max-width: 52rem;
         padding: 0 1rem; color: #1a1a2e; background: #fdfdff; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.05rem; margin-top: 2rem; }
  table { border-collapse: collapse; width: 100%; margin-top: .5rem; }
  th, td { border: 1px solid #d8d8e4; padding: .4rem .6rem; text-align: left;
           vertical-align: top; }
  th { background: #f0f0f7; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  pre { background: #f0f0f7; padding: .8rem; overflow-x: auto; border-radius: 6px; }
  .muted { color: #5c5c72; }
</style>
</head>
<body>
<h1>${escapeHtml(doc.info.title)} <span class="muted">v${escapeHtml(doc.info.version)}</span></h1>
<p>${escapeHtml(doc.info.description)}</p>
<h2>Endpoints</h2>
<table>
<thead><tr><th>Method</th><th>Path</th><th>Summary</th></tr></thead>
<tbody>${rows.join("\n")}</tbody>
</table>
<h2>Machine-readable spec</h2>
<p>Fetch <code>/api/v1/openapi.json</code> with the same Bearer key for the
full OpenAPI 3.1 document (schemas, enums, error envelope).</p>
<pre>curl --oauth2-bearer "$LB_API_KEY" /api/v1/openapi.json</pre>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const gate = await apiGate(request);
  if (!gate.ok) {
    // Browser fallback: an authenticated admin session may view the page.
    if (gate.response.status === 401 && (await getSession())) {
      return new NextResponse(renderDocs(), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return gate.response;
  }

  return new NextResponse(renderDocs(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...gate.rateHeaders,
    },
  });
}
