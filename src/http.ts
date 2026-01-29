const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

export interface FetchOptions extends RequestInit {
  /** Override timeout in milliseconds (default: 15000) */
  timeoutMs?: number;
  /** Number of retry attempts for transient errors (default: 2) */
  retries?: number;
  /** Delay between retries in milliseconds (default: 500) */
  retryDelayMs?: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly url?: string,
    public readonly bodySnippet?: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetchWithTimeout wraps the global fetch with:
 * - per-request timeout using AbortController
 * - basic retry logic for network/timeout errors
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    ...fetchOptions
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      // If this was the last attempt, rethrow
      if (attempt === retries) {
        throw new Error(
          `Request to ${url} failed after ${retries + 1} attempt(s): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      // Otherwise wait and retry
      await sleep(retryDelayMs);
    }
  }

  // Should be unreachable, but TypeScript needs a return/throw
  throw lastError instanceof Error
    ? lastError
    : new Error(`Request to ${url} failed for unknown reasons`);
}

/**
 * Helper to throw a rich HttpError when response.ok is false.
 * Reads a small snippet of the body (if any) for easier debugging.
 */
export async function assertOk(
  response: Response,
  contextMessage: string
): Promise<void> {
  if (response.ok) return;

  let bodySnippet: string | undefined;
  try {
    const text = await response.text();
    bodySnippet = text.slice(0, 500);
  } catch {
    // Ignore body read errors
  }

  const url = response.url;
  const messageParts = [
    contextMessage,
    `status=${response.status}`,
    response.statusText && `statusText=${response.statusText}`,
    url && `url=${url}`,
    bodySnippet && `body=${bodySnippet}`,
  ].filter(Boolean);

  throw new HttpError(messageParts.join(" | "), response.status, url, bodySnippet);
}

