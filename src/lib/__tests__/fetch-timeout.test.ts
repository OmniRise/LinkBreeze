import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Regression tests for the stalled-save bug: the favicon/OG fetchers used to
 * clearTimeout the moment response HEADERS arrived, so a server that sent
 * headers promptly but never finished (or never even started streaming) the
 * body hung the reader forever — the link save server action never returned
 * and the link was never written.
 *
 * The fix keeps the timeout armed until the body read finishes. These tests
 * stub global fetch with responses whose body streams error when the fetch's
 * AbortSignal fires (mimicking real fetch semantics) and use fake timers:
 * with the bug present the reader never resolves and the test times out;
 * with the fix the abort lands and the chain unwinds to a clean null.
 */

/** A 200 with headers-ready-then-silence: the body never emits a byte, and
 * errors only when `signal` aborts — exactly how a real fetch behaves. */
function stalledResponse(contentType: string, signal: AbortSignal | null | undefined): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal) {
        signal.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true });
      }
      // No enqueue, no close — the reader pends forever until the abort.
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": contentType } });
}

function stubStalledFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string | URL, init?: { signal?: AbortSignal }) =>
      Promise.resolve(stalledResponse("text/html", init?.signal)),
    ),
  );
}

describe("stalled-body fetches cannot hang a link save", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lb-fetch-timeout-"));
    process.env.UPLOAD_DIR = tmpDir;
    vi.resetModules();
    vi.useFakeTimers();
    stubStalledFetch();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.UPLOAD_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("favicon: a body that never streams resolves null instead of hanging forever", async () => {
    const { fetchAndCacheFavicon } = await import("@/lib/favicon");
    let settled = false;
    const pending = fetchAndCacheFavicon("https://stalls-forever.example.com/page").then((r) => {
      settled = true;
      return r;
    });
    // Drive the fake clock past the 12s phase cap. Each stalled fetch is
    // aborted by its (still-armed) timeout; if the bug were present the
    // body read would pend with no timer to break it and `settled` would
    // stay false — a fast, deterministic failure instead of a hang.
    for (let i = 0; i < 30 && !settled; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(settled).toBe(true);
    await expect(pending).resolves.toBeNull();
  }, 20_000);

  it("OG fetcher: a body that never streams resolves empty instead of hanging forever", async () => {
    const { fetchOgData } = await import("@/lib/og-fetcher");
    const pending = fetchOgData("https://stalls-forever.example.com/page");
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({
      title: null,
      description: null,
      imageUrl: null,
      siteName: null,
    });
  }, 20_000);
});
