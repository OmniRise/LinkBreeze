/**
 * Rate-limit / audit identity for a request (security audit CD-5 + PS-2).
 *
 * X-Forwarded-For is client-controlled on a direct bind: the Next server only
 * fills the header when the client sent none (`??=` in base-server), so ANY
 * hop an attacker sends is accepted verbatim and per-IP buckets keyed on it
 * can be rotated at will by changing the header.
 *
 * LINKBREEZE_TRUST_X_FORWARDED_FOR=false (default — the compose file binds
 *   :3000 directly):
 *   the header is not trusted. Every request keys on one shared identity, so
 *   XFF rotation cannot mint fresh buckets. The global login/TOTP caps stay
 *   the real control, and audit rows record the shared identity instead of
 *   attacker-chosen text. Operators with real proxied traffic should set it
 *   to true (they are behind nginx/Caddy/a tunnel anyway).
 *
 * LINKBREEZE_TRUST_X_FORWARDED_FOR=true: the operator declares that a trusted
 *   reverse proxy is the immediate peer and overwrites or appends the real
 *   client to X-Forwarded-For. The LAST hop is then the client as the trusted
 *   proxy saw it — the standard rightmost-untrusted read. Only enable this
 *   for a proxy you control.
 */
const UNTRUSTED_KEY = "direct";

export function clientIp(headers: Headers): string {
  if (process.env.LINKBREEZE_TRUST_X_FORWARDED_FOR !== "true") return UNTRUSTED_KEY;
  const xff = headers.get("x-forwarded-for");
  if (!xff) return UNTRUSTED_KEY;
  const hops = xff
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return hops[hops.length - 1] ?? UNTRUSTED_KEY;
}
