/**
 * Shared in-memory rate limit state.
 * The Gemini proxy writes here when it encounters 429/503 errors,
 * and the chat heartbeat reads from here to show the user the REAL
 * error message and countdown.
 */

export interface RateLimitInfo {
  /** Raw error message/body from the provider */
  rawError: string;
  /** HTTP status code from provider */
  statusCode: number;
  /** When the rate limit was hit (ms) */
  hitAt: number;
  /** When the next retry will happen (ms) */
  nextRetryAt: number;
  /** Which retry attempt we're on */
  attempt: number;
  /** Max retries configured */
  maxRetries: number;
}

/** Current rate limit state — null means not rate limited */
let currentState: RateLimitInfo | null = null;

export function setRateLimitState(info: RateLimitInfo): void {
  currentState = info;
}

export function clearRateLimitState(): void {
  currentState = null;
}

export function getRateLimitState(): RateLimitInfo | null {
  // Auto-expire if the retry time has long passed (stale state)
  if (currentState && Date.now() > currentState.nextRetryAt + 30_000) {
    currentState = null;
  }
  return currentState;
}
