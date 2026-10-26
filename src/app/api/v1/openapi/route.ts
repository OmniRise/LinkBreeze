/**
 * GET /api/v1/openapi (#4) — the OpenAPI 3.1 document, auth-gated (same
 * Bearer key as everything else: no anonymous surface fingerprinting).
 * /api/v1/openapi.json is the dotted alias served by ../openapi.json/route.ts
 * (both are drift-tested against this builder).
 */
import { NextRequest, NextResponse } from "next/server";
import { apiGate } from "@/server/api-auth";
import { buildOpenApiDocument } from "@/lib/openapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await apiGate(request);
  if (!gate.ok) return gate.response;

  return NextResponse.json(buildOpenApiDocument(), {
    headers: { "Cache-Control": "no-store", ...gate.rateHeaders },
  });
}
