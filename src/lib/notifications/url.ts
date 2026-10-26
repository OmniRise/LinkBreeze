/**
 * Webhook URL validation (#13). The configured URL is fetched server-side,
 * so the scheme is restricted to http(s) — file:, data:, ftp: etc. are
 * rejected at the validation boundary (the settings action), never at
 * render/delivery sites.
 */

export function isValidWebhookUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  if (raw.length === 0 || raw.length > 2048) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}
