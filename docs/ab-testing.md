# Running your first A/B test

LinkBreeze can split one link's traffic between two destinations, measure each
variant, and promote a winner — no JavaScript on the public page, no cookie,
no third-party service. This guide walks a first test end to end with worked
example numbers.

## What actually happens

Every visitor is assigned to variant **A** or **B** by hashing their existing
cookieless visitor fingerprint together with the link id. The assignment is:

- **Sticky** — the same visitor always sees the same variant across visits.
- **Server-side** — nothing is stored in the browser, so there is nothing to
  clear, tamper with, or block; the split works with JavaScript disabled.
- **Independent per link** — a visitor can be variant A on one link and
  variant B on another.

Variant A always points at the link's own URL; you only configure variant B's
destination and how much traffic each side gets.

## 1. Create the test

1. Go to **Links** and edit any **URL-type** link (A/B tests need a saved
   link — create it first, then edit).
2. Turn on **A/B test**.
3. Fill in:
   - **Variant B URL** — e.g. `https://example.com/pricing`
   - **Label A / Label B** (optional) — e.g. `homepage` vs `pricing`
   - **Weight A** — e.g. `70` means 70% of visitors get variant A; variant B
     automatically gets the rest (30%).
   - **Starts / Ends** (optional) — a schedule window, see [3. Schedule](#3-optional-schedule-the-window).
4. Check the resolved-URL preview (`A: …` / `B: …`), optionally hit
   **Open both** to eyeball each destination, then **Save**.

From the next redirect on, `/go/<your-link>` serves each visitor their
variant.

## 2. Read the numbers

Open the link's detail page. Under the clicks chart you'll see a per-variant
card. Worked example after a few days at a 70/30 split:

| Variant | Clicks | Share |
|---|---|---|
| A · homepage | 340 | 34% |
| B · pricing | 660 | 66% |

With 1,000 total variant clicks the card also shows:

- **Lift B vs A: +94.1%** — variant B produced 94% more clicks than variant A
  (660 vs 340).
- **Statistically significant (95%)** — the observed 34/66 split is far too
  far from the configured 70/30 to be noise (binomial goodness-of-fit against
  your weights).

Honesty floor: below **100 variant clicks** the card always says
*"Not enough data for a confident winner"* — a 12-click lead never gets
presented as a result. You can keep clicking **Promote** manually anyway;
the floor only governs what the card and the auto-promoter will *claim*.

## 3. Optional: schedule the window

Set **Starts** and/or **Ends** (empty = unbounded). Outside the window the
link transparently serves variant A only, and those clicks are not labeled
into the experiment. Edges are inclusive; an end must come after the start.

## 4. Pause, promote, finish

- **Pause** stops the split immediately (everyone gets A) and keeps all data.
  **Resume** restarts it with the same sticky assignments.
- **Promote A** archives the test and keeps the current URL as the permanent
  destination.
- **Promote B** archives the test and writes variant B's URL into the link.
  Your short URL (`/go/...`) and any QR codes keep working — they point at
  the redirect, not the destination.
- Either way the labels, weights, and per-variant click history are kept: an
  archived test renders as read-only history on the detail page.

## 5. Optional: auto-promotion

**Settings → Data → A/B test auto-promotion** (off by default). When enabled,
a *running* test whose variant clicks reach **200** with a significant margin
is promoted and archived automatically — the same math the card shows, so
what you see is what automation acts on. It never fires:

- while a scheduled window is still open (it would cut your run short), or
- on paused/archived tests, or below the significance floor.

## Where else variants show up

- **Clicks CSV export** (`Analytics → Export`) gains a `variant` column
  (`A`, `B`, or empty when no test was active).
- The dashboard and Top-links cards stay unified (total clicks), by design.
- Backups carry the test config; restoring an old backup can never revive a
  finished test as a live split.

## FAQ

**Can a visitor force a variant?** No — assignment is a deterministic hash on
the server; there is no cookie or client storage to edit, and the destination
is validated against the same URL allowlist as normal links on every write.

**Do bots skew the split?** Bots receive a fair split like everyone (so the
recorded ratio matches what humans experience) but their clicks are filtered
from analytics by the usual crawler detection.

**What happens when a variant wins?** Nothing automatically unless
auto-promotion is on (step 5). Promotion is deliberately a manual,
confirmation-guarded click: the winner becomes the link's permanent URL and
the test moves to history.
