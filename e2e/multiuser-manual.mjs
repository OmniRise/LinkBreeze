// #124 live E2E — multi-user + roles UI flows against a throwaway instance.
// Run: node e2e-multiuser.mjs (from the worktree root, server on :4321)
import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:4321";
const TS = Date.now().toString(36).slice(-4); // idempotent re-runs
const ROLE_NAME = `Editor${TS}`;
const BOB = `bob${TS}`;
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

try {
  // ── 1. admin login ────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`);
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`);
  await page.waitForSelector("#username");
  await page.fill("#username", "admin");
  await page.fill("#password", "E2eAdmin123");
  await page.click('form:has(#username) button[type="submit"]');
  await page.waitForURL(/dashboard/);
  check("admin login", true);

  // ── 2. accounts page renders: roles list + policy card ───────────────
  await page.goto(`${BASE}/accounts`);
  await page.waitForSelector("text=All accounts");
  const bodyText = await page.textContent("body");
  const hasPolicy = bodyText.includes("New account pages");
  const hasAdmin = bodyText.includes("Admin");
  const hasMember = bodyText.includes("Member");
  check("accounts page: roles model renders", hasAdmin && hasMember);
  check("accounts page: policy card renders", hasPolicy);

  // ── 3. create a custom role "Editor" (2 pages, view_all) ─────────────
  await page.click('button:has-text("New role")');
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.locator("#role-name").fill(ROLE_NAME);
  await dialog.locator("#role-limit").fill("2");
  await dialog.locator("#role-visibility").selectOption("view_all");
  await dialog.locator('button[type="submit"]').click();
  await dialog.waitFor({ state: "detached" });
  await page.waitForTimeout(1500); // router.refresh
  const editorRow = page.locator("div.rounded-lg.border", { hasText: ROLE_NAME }).first();
  await editorRow.waitFor();
  check("custom role created via UI", await editorRow.isVisible());

  // ── 4. create account bob with the Editor role ───────────────────────
  await page.fill("#new-username", BOB);
  await page.fill("#new-password", "BobPass123");
  await page.selectOption("#new-role", { label: ROLE_NAME });
  await page.click('form:has(#new-username) button[type="submit"]');
  const bobRow = page.locator("div.rounded-lg.border", { hasText: BOB }).first();
  await bobRow.waitFor({ timeout: 10000 });
  check("account created with Editor role", (await bobRow.textContent()).includes(ROLE_NAME));

  // ── 5. OIDC settings card visible for admin in Security tab ──────────
  await page.goto(`${BASE}/settings#security`);
  await page.waitForSelector("#oidc-issuer");
  const issuerVal = await page.inputValue("#oidc-issuer");
  check("admin sees OIDC card with issuer", issuerVal === "https://idp.example.com", issuerVal);

  // ── 6. sign out, log in as bob ───────────────────────────────────────
  await page.click('form:has(input[name="signout"]) button, button:has-text("Sign out")').catch(async () => {
    // fallback: locate the sidebar sign-out form generically
    await page.locator('form[action*="signout"] button, form:has(button:text("Sign out")) button').first().click();
  });
  await page.waitForURL(/login/);
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`);
  await page.waitForSelector("#username");
  await page.fill("#username", BOB);
  await page.fill("#password", "BobPass123");
  await page.click('form:has(#username) button[type="submit"]');
  await page.waitForURL(/dashboard/);
  check("bob (Editor) login", true);

  // ── 7. bob cannot open /accounts (page gate redirects) ───────────────
  await page.goto(`${BASE}/accounts`);
  await page.waitForURL(/dashboard/);
  check("member redirected away from /accounts", true);

  // ── 8. bob's settings has NO OIDC card (capability-gated UI) ─────────
  await page.goto(`${BASE}/settings#security`);
  await page.waitForTimeout(1200);
  const oidcCount = await page.locator("#oidc-issuer").count();
  check("member does NOT see OIDC card", oidcCount === 0);

  // ── 9. bob got his own page (per_user policy) ────────────────────────
  const res = await page.request.get(`${BASE}/${BOB}`);
  check("bob's public page exists at /" + BOB, res.status() === 200, `status ${res.status()}`);

  // ── 10. SSO button on login (config present) ─────────────────────────
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/login`);
  const sso = await p2.isVisible("text=Sign in with SSO");
  check("SSO button renders on login", sso);
  await ctx2.close();
} catch (err) {
  check("UNEXPECTED ERROR", false, String(err).slice(0, 300));
  await page.screenshot({ path: "/tmp/lb-e2e/failure.png", fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}
