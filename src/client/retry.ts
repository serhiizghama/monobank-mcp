import { AuthError, MonobankError, RateLimitError } from '../errors/index.js';

const BACKOFF_DELAYS_MS = [2000, 4000, 8000, 16000, 32000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (err instanceof AuthError) throw err;
      if (err instanceof MonobankError && err.category === 'validation') throw err;

      if (err instanceof RateLimitError) {
        const delay = err.retryAfterSeconds
          ? err.retryAfterSeconds * 1000
          : (BACKOFF_DELAYS_MS[attempt] ?? 32000);
        await sleep(delay);
        continue;
      }

      if (attempt < maxAttempts - 1) {
        await sleep(BACKOFF_DELAYS_MS[attempt] ?? 32000);
      }
    }
  }

  throw lastError;
}
