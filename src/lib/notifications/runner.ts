/**
 * Delivery runner (#13).
 *
 * PURE orchestration: fetch/clock/sleep are injected so tests run without a
 * network. Bounded retries (3 attempts), per-attempt timeout, NEVER throws —
 * the final outcome is returned and every attempt is reported through
 * `onAttempt` so the server wrapper can write delivery-log rows.
 */

export const DELIVERY_TIMEOUT_MS = 10_000;
export const DELIVERY_MAX_ATTEMPTS = 3;
export const DELIVERY_BACKOFF_MS = [200, 800];

export interface AttemptRecord {
  attempt: number;
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
}

export interface DeliveryDeps {
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  timeoutMs?: number;
  backoffMs?: readonly number[];
  maxAttempts?: number;
  onAttempt?: (record: AttemptRecord) => void;
}

export interface DeliveryOutcome {
  ok: boolean;
  attempts: AttemptRecord[];
}

/** Shorten an unknown error into something loggable. */
function errorText(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 500);
  return String(err).slice(0, 500);
}

export async function deliverWithRetries(
  request: { url: string; headers: Record<string, string>; body: string },
  deps: DeliveryDeps,
): Promise<DeliveryOutcome> {
  const maxAttempts = deps.maxAttempts ?? DELIVERY_MAX_ATTEMPTS;
  const backoff = deps.backoffMs ?? DELIVERY_BACKOFF_MS;
  const timeoutMs = deps.timeoutMs ?? DELIVERY_TIMEOUT_MS;
  const attempts: AttemptRecord[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const record = await deliverOnce(request, attempt, timeoutMs, deps.fetchImpl);
    attempts.push(record);
    deps.onAttempt?.(record);
    if (record.ok) return { ok: true, attempts };
    if (attempt < maxAttempts) await deps.sleep(backoff[attempt - 1] ?? backoff[backoff.length - 1]);
  }
  return { ok: false, attempts };
}

async function deliverOnce(
  request: { url: string; headers: Record<string, string>; body: string },
  attempt: number,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<AttemptRecord> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    // 2xx = delivered. 4xx client errors are NOT retried by the provider
    // conventions we care about, but keeping the runner simple (always
    // bounded-retry) is acceptable: 3 attempts max either way.
    const ok = res.status >= 200 && res.status < 300;
    return { attempt, ok, httpStatus: res.status, error: ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { attempt, ok: false, httpStatus: null, error: errorText(err) };
  } finally {
    clearTimeout(timer);
  }
}
