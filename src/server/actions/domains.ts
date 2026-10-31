"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { promises as dns } from "node:dns";

import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  validationError,
  notFoundError,
  conflictError,
} from "@/lib/errors";
import { requireInstanceAdmin } from "@/server/access";
import { parseDomainInput } from "@/lib/host-routing";
import { getPageById } from "@/server/queries";
import {
  activateDomain,
  createDomain,
  deleteDomain,
  getDomainByHost,
  listAdminDomains,
  saveDomainPolicy,
  setPageDomainScope,
  updateDomainBehavior,
  updateDomainKind,
} from "@/server/domains";

/**
 * Admin actions for custom domains (#85). Every mutation follows the house
 * pattern: demoGuard → capability gate → zod → ActionResult. The /domains page
 * revalidates after each change so the proxy's next request reads fresh rows.
 */

const idSchema = z.coerce.number().int().positive();
const kindSchema = z.enum(["primary", "alias"]);
const behaviorSchema = z.enum(["serve", "redirect_canonical", "redirect_slug"]);
const scopeSchema = z.enum(["exclusive", "hub"]);

function refresh() {
  revalidatePath("/domains");
}

export async function addDomainAction(
  formData: FormData,
): Promise<ActionResult<{ domainId: number }>> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const schema = z.object({
    host: z.string().max(300),
    pageId: idSchema,
    kind: kindSchema,
    behavior: behaviorSchema,
  });
  const parsed = schema.safeParse({
    host: formData.get("host"),
    pageId: formData.get("pageId"),
    kind: formData.get("kind") || "primary",
    behavior: formData.get("behavior") || "serve",
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  // Normalize user input to stored form (punycode, no scheme/port/path).
  const host = parseDomainInput(parsed.data.host);
  if (!host) {
    return validationError("Enter a valid domain name, e.g. jane.com");
  }

  const page = await getPageById(parsed.data.pageId);
  if (!page) return notFoundError("Page not found");

  if (await getDomainByHost(host)) {
    return conflictError("This domain is already bound");
  }

  // One canonical identity per page: demoting an existing primary is the
  // operator's explicit move, not a silent side effect.
  const existing = await listAdminDomains();
  if (
    parsed.data.kind === "primary" &&
    existing.some((d) => d.pageId === parsed.data.pageId && d.kind === "primary")
  ) {
    return conflictError("This page already has a primary domain");
  }

  const domainId = await createDomain({
    host,
    pageId: parsed.data.pageId,
    kind: parsed.data.kind,
    behavior: parsed.data.behavior,
  });
  refresh();
  return { success: true, domainId };
}

export async function updateDomainAction(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const parsed = z
    .object({ domainId: idSchema, behavior: behaviorSchema, kind: kindSchema })
    .safeParse({
      domainId: formData.get("domainId"),
      behavior: formData.get("behavior"),
      kind: formData.get("kind"),
    });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const rows = await listAdminDomains();
  const domain = rows.find((d) => d.id === parsed.data.domainId);
  if (!domain) return notFoundError("Domain not found");

  // Same one-primary-per-page rule on edits.
  if (
    parsed.data.kind === "primary" &&
    domain.kind !== "primary" &&
    rows.some(
      (d) =>
        d.pageId === domain.pageId &&
        d.kind === "primary" &&
        d.id !== domain.id,
    )
  ) {
    return conflictError("This page already has a primary domain");
  }

  await updateDomainBehavior(parsed.data.domainId, parsed.data.behavior);
  await updateDomainKind(parsed.data.domainId, parsed.data.kind);
  refresh();
  return { success: true };
}

export async function deleteDomainAction(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const parsed = idSchema.safeParse(formData.get("domainId"));
  if (!parsed.success) return validationError("Invalid domain");

  await deleteDomain(parsed.data);
  refresh();
  return { success: true };
}

export async function activateDomainAction(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const parsed = idSchema.safeParse(formData.get("domainId"));
  if (!parsed.success) return validationError("Invalid domain");

  // Manual activation for /etc/hosts-style testing before DNS propagates.
  await activateDomain(parsed.data);
  refresh();
  return { success: true };
}

export async function setPageDomainScopeAction(
  formData: FormData,
): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const parsed = z
    .object({ pageId: idSchema, scope: scopeSchema })
    .safeParse({ pageId: formData.get("pageId"), scope: formData.get("scope") });
  if (!parsed.success) return validationError("Invalid scope");

  const page = await getPageById(parsed.data.pageId);
  if (!page) return notFoundError("Page not found");

  await setPageDomainScope(parsed.data.pageId, parsed.data.scope);
  refresh();
  return { success: true };
}

const policySchema = z.object({
  primaryHost: z.string().max(300),
  adminLock: z.enum(["strict", "off"]),
  unknownFallback: z.enum(["path", "404", "redirect_primary"]),
  wwwPolicy: z.enum(["redirect", "serve", "off"]),
  canonical: z.enum(["301", "tag", "off"]),
});

export async function saveDomainPolicyAction(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const parsed = policySchema.safeParse({
    primaryHost: formData.get("primaryHost") ?? "",
    adminLock: formData.get("adminLock"),
    unknownFallback: formData.get("unknownFallback"),
    wwwPolicy: formData.get("wwwPolicy"),
    canonical: formData.get("canonical"),
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  // "" (cleared) = derive from settings/env only; otherwise store normalized.
  const host = parsed.data.primaryHost
    ? parseDomainInput(parsed.data.primaryHost)
    : "";
  if (parsed.data.primaryHost && !host) {
    return validationError("Enter a valid primary host, e.g. links.example.com");
  }

  await saveDomainPolicy({
    primaryHost: host || null,
    adminLock: parsed.data.adminLock,
    unknownFallback: parsed.data.unknownFallback,
    wwwPolicy: parsed.data.wwwPolicy,
    canonical: parsed.data.canonical,
  });
  refresh();
  return { success: true };
}

export interface DnsCheckResult {
  a: string[];
  aaaa: string[];
  cname: string[];
}

/**
 * Informational DNS lookup for the operator ("did my A/CNAME record
 * propagate?"). LinkBreeze cannot verify ownership of a domain — the real
 * proof is the first request arriving with that Host header, which flips
 * the binding from pending to active. This is a convenience diagnostic.
 */
export async function checkDomainDnsAction(
  host: string,
): Promise<ActionResult<DnsCheckResult>> {
  // Demo instances are public with auto-login — a DNS oracle for every
  // visitor is not acceptable, so this follows the demoGuard pattern too.
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const normalized = parseDomainInput(host);
  if (!normalized) return validationError("Invalid domain");

  const result: DnsCheckResult = { a: [], aaaa: [], cname: [] };
  try {
    result.a = await dns.resolve4(normalized);
  } catch {
    /* NXDOMAIN / no A record — reported as empty */
  }
  try {
    result.aaaa = await dns.resolve6(normalized);
  } catch {
    /* no AAAA record */
  }
  try {
    result.cname = await dns.resolveCname(normalized);
  } catch {
    /* no CNAME record */
  }
  return { success: true, ...result };
}
