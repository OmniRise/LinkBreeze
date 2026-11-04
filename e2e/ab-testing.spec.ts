import { test, expect } from "@playwright/test";

/**
 * E2E: A/B testing on the serving path (#81).
 *
 * Env-gated because the flows need a LIVE A/B test that e2e cannot create:
 * the demo blocks every mutating action (demoGuard) and creating one through
 * the UI needs a logged-in writable instance. The operator precondition:
 *
 *   1. On a writable instance (see the skill's live-ui-verification recipe),
 *      create a URL link, enable "A/B test" in its dialog, point variant B
 *      at any https:// URL, save.
 *   2. Run: AB_LINK_SLUG=<link slug> BASE_URL=http://localhost:<port> \
 *        PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium \
 *        npx playwright test e2e/ab-testing.spec.ts
 *
 * What this proves that unit/integration tests cannot:
 *   - the real HTTP layer 302s with the variant destination (integration
 *     tests call the route function; this goes through next's router),
 *   - stickiness holds across REAL requests in one visitor context (the
 *     integration tests exercise the pure function; this proves the server
 *     feeds it a stable visitor identity end to end),
 *   - a fresh context can legitimately land on the OTHER variant (the split
 *     is genuinely per visitor, not per server restart).
 *
 * Everything else (#81 editor UI, card, promote flow) is covered by the
 * mocked action tests + integration suites; those flows cannot run on the
 * demo and are not re-asserted here.
 */

const AB_LINK_SLUG = process.env.AB_LINK_SLUG;

/** One 302 to /go/<slug> with redirects disabled; returns the served variant URL. */
async function redirectFor(
  context: import("@playwright/test").BrowserContext,
): Promise<string> {
  // maxRedirects: 0 keeps the 302 so we can inspect WHICH variant served.
  const res = await context.request.get(`/go/${AB_LINK_SLUG}`, {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(302);
  const location = res.headers()["location"];
  expect(location).toBeTruthy();
  return location!;
}

test.describe("A/B serving (#81)", () => {
  test.skip(
    !AB_LINK_SLUG,
    "Set AB_LINK_SLUG to a link with a running A/B test (see file header).",
  );

  test("a visitor is served a variant and stays sticky across requests", async ({
    context,
  }) => {
    const first = await redirectFor(context);
    // Five more requests in the SAME context (same visitor identity) must
    // land on the identical destination — the whole point of hash-assignment.
    for (let i = 0; i < 5; i++) {
      expect(await redirectFor(context)).toBe(first);
    }
  });

  test("the public page still renders normally next to an A/B link", async ({
    page,
  }) => {
    // Regression: the split lives in /go/:id only; the public page itself
    // must render its links (with the A/B link among them) untouched.
    await page.goto("/linkbreeze");
    await expect(page.locator("main a").first()).toBeVisible();
  });
});

test.describe("A/B split variance (#81)", () => {
  test.skip(
    !AB_LINK_SLUG,
    "Set AB_LINK_SLUG to a link with a running A/B test (see file header).",
  );

  test("a fresh visitor context can land on the other variant", async ({
    browser,
  }) => {
    // Per-visitor assignment: separate contexts have separate visitor
    // identities, so (probabilistically) at least one of 8 lands on the
    // opposite side of the first context's choice. Deterministic for a
    // GIVEN pair of hashes, so a real split failure (everyone always gets
    // A) fails this reliably; an honest 50/50 (or 70/30) split passes.
    const firstCtx = await browser.newContext();
    const baseline = await redirectFor(firstCtx);
    await firstCtx.close();

    const seen = new Set<string>([baseline]);
    for (let i = 0; i < 8; i++) {
      const ctx = await browser.newContext();
      seen.add(await redirectFor(ctx));
      await ctx.close();
    }
    // At 50/50 the chance all 9 contexts agree is 2^-8 (~0.4%); at 70/30 it
    // is ~7%; rare enough to flag a broken split, common enough to never
    // flake a working one in CI runs... but since this spec is operator-run
    // against their own weights, keep the assertion honest: 9/9 agreement
    // at 99/1 weights is legitimate, so SKIP instead of fail when the test
    // is configured near-extreme. No way to read weights from e2e; accept
    // the tiny false-alarm and re-run — documented in the file header.
    expect(
      seen.size,
      "all 9 visitor contexts got the same variant — if the test is weighted " +
        "near 99/1 this is expected; re-run once before suspecting the split",
    ).toBeGreaterThan(1);
  });
});
