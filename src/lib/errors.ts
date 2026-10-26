/**
 * LinkBreeze Error System — Core types and utilities.
 *
 * Every server action returns an ActionResult. This file defines the canonical
 * type, the error code enum, structured logging, and a withAction wrapper that
 * catches unhandled errors so nothing ever gets silently swallowed.
 *
 * Design goals:
 *  - No catch+swallow anywhere in the codebase. Every error is either a known
 *    validation/auth/demo/rate-limit case (returned with a specific code) or an
 *    unexpected internal error (logged with context, returned as a generic
 *    message to avoid leaking details).
 *  - The UI can branch on errorCode to show the right message style (inline
 *    banner for validation, toast for success, full-page for server errors).
 *  - Structured logging gives the operator enough context to debug without
 *    exposing secrets in logs.
 */

// ── Error codes ─────────────────────────────────────────────────────────

export const ErrorCode = {
  VALIDATION: "validation",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  DEMO: "demo",
  RATE_LIMIT: "rate_limit",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  INTERNAL: "internal",
  /** #5: credentials valid — a TOTP code is required to finish the login. */
  TOTP_REQUIRED: "totp_required",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ── Result types ────────────────────────────────────────────────────────

/**
 * Standard action result. Success variants can carry data via generic T.
 * Error variants always include a human-readable message and a machine code.
 */
export type ActionResult<T = void> =
  | ({ success: true } & ([T] extends [void] ? unknown : T))
  | ActionError;

/** Error variant — always the same shape regardless of T. */
export type ActionError = { success: false; error: string; errorCode: ErrorCode };

// ── Structured error logging ────────────────────────────────────────────

/**
 * Log an unexpected error with structured context.
 * Never logs secrets, passwords, tokens, or full request bodies.
 */
export function logError(
  context: string,
  err: unknown,
  meta?: Record<string, unknown>,
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  // Extract a safe subset of meta — strip anything that looks sensitive.
  // Covers auth material specifically: authorization/bearer headers and API
  // keys ride request context in meta sometimes; they must never be logged.
  const safeMeta: Record<string, unknown> = {};
  if (meta) {
    for (const [key, value] of Object.entries(meta)) {
      if (/password|secret|token|key|hash|cookie|authorization|bearer/i.test(key)) continue;
      safeMeta[key] = value;
    }
  }

  console.error(JSON.stringify({
    level: "error",
    context,
    message,
    ...(Object.keys(safeMeta).length > 0 ? { meta: safeMeta } : {}),
    ...(stack ? { stack } : {}),
    timestamp: new Date().toISOString(),
  }));
}

// ── withAction wrapper ──────────────────────────────────────────────────

/**
 * Wrap a server action body so that unhandled errors never crash the server
 * or leak stack traces to the client. The error is logged with context and
 * returned as a generic internal error.
 *
 * Usage:
 *   export const createLink = withAction("createLink", async (formData) => {
 *     // ... action logic ...
 *     return { success: true };
 *   });
 *
 * If the action throws, the user sees: "Something went wrong. Please try again."
 * and the operator sees a structured log entry with the full error.
 */
export function withAction<TArgs extends unknown[], TResult extends ActionResult>(
  context: string,
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await fn(...args);
    } catch (err) {
      logError(context, err);
      return {
        success: false,
        error: "Something went wrong. Please try again.",
        errorCode: ErrorCode.INTERNAL,
      } as TResult;
    }
  };
}

// ── Convenience constructors ────────────────────────────────────────────

export function validationError(message: string): ActionError {
  return { success: false, error: message, errorCode: ErrorCode.VALIDATION };
}

export function unauthorizedError(): ActionError {
  return { success: false, error: "Unauthorized", errorCode: ErrorCode.UNAUTHORIZED };
}

export function demoError(): ActionError {
  return {
    success: false,
    error: "This is a read-only demo. Deploy your own instance to make changes.",
    errorCode: ErrorCode.DEMO,
  };
}

export function notFoundError(message = "Not found"): ActionError {
  return { success: false, error: message, errorCode: ErrorCode.NOT_FOUND };
}

export function conflictError(message: string): ActionError {
  return { success: false, error: message, errorCode: ErrorCode.CONFLICT };
}

export function rateLimitError(retryAfter: number): ActionError {
  return {
    success: false,
    error: `Too many requests. Try again in ${retryAfter}s.`,
    errorCode: ErrorCode.RATE_LIMIT,
  };
}
