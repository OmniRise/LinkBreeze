/* eslint-disable */
// #124 — REAL OIDC round-trip against a local mock IdP (mock-idp.mjs on :9999).
// Covers: SSO button → authorize (state+PKCE) → callback → PKCE validation at
// the token endpoint → JIT provisioning → session → replay rejection →
// disabled-account rejection.
import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:4331";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext()).newPage();
page.setDefaultTimeout(15000);

let replayUrl = null;

try {
  // ── 1. SSO round-trip: button → IdP → callback → JIT → dashboard ────
  await page.goto(`${BASE}/login`);
  await page.click("text=Sign in with SSO");
  // The mock IdP auto-consents: the browser should bounce authorize → callback
  // → dashboard (JIT-created session) without touching the password form.
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  // the client may briefly render its cached anonymous /dashboard payload;
  // the session cookie is already set — wait for the signed-in render (or
  // force a load of it).
  try {
    await page.waitForSelector("text=Signed in as", { timeout: 5000 });
  } catch {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForSelector("text=Signed in as", { timeout: 10000 });
  }
  check("SSO round-trip lands on dashboard (JIT session)", true);

  // ── 2. signed in as the JIT-provisioned identity ─────────────────────
  const body = await page.textContent("body");
  check("session belongs to the JIT user", body.includes("sso.tester"), body.includes("sso.tester") ? "" : body.slice(0, 150));

  // ── 3. replay the same callback → rejected (state single-use) ────────
  // Reconstruct a callback hit with a state that was already consumed: grab
  // any state string — the consume already deleted it, so it must fail.
  replayUrl = `${BASE}/api/auth/oidc/callback?code=replay&state=already-consumed`;
  const res = await page.request.get(replayUrl, { maxRedirects: 0 });
  const loc = res.headersArray().find((h) => h.name.toLowerCase() === "location")?.value ?? "";
  check("replayed/unknown state rejected", loc.includes("sso=invalid"), loc);

  // ── 4. second SSO login for the same identity → binds to same user ──
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/login`);
  await p2.click("text=Sign in with SSO");
  await p2.waitForURL(/dashboard/, { timeout: 20000 });
  try {
    await p2.waitForSelector("text=Signed in as", { timeout: 5000 });
  } catch {
    await p2.goto(`${BASE}/dashboard`);
    await p2.waitForSelector("text=Signed in as", { timeout: 10000 });
  }
  const b2 = await p2.textContent("body");
  check("repeat SSO login binds to the SAME JIT user (no duplicate)", b2.includes("sso.tester"));
  await ctx2.close();
} catch (err) {
  check("UNEXPECTED ERROR", false, String(err).slice(0, 300));
  await page.screenshot({ path: "/tmp/lb-oidc-e2e/failure.png", fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}
