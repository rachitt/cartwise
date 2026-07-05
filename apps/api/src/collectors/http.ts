import type { ChainSlug } from "@cartwise/shared";

import { CollectorError } from "./types.js";

const DEFAULT_RATE_LIMIT = { perSecond: 1, burst: 5 };
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 250;
const MAX_RETRY_DELAY_MS = 10_000;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export interface CollectorHttpOptions {
  chain: ChainSlug;
  fetch?: typeof fetch;
  now?: () => number;
  rateLimit?: { perSecond: number; burst: number };
  timeoutMs?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

export interface CollectorHttp {
  request(url: string, init?: CollectorHttpRequestInit): Promise<Response>;
  getJson<T>(url: string, init?: { headers?: Record<string, string> }): Promise<T>;
}

export type CollectorHttpRequestInit = Omit<RequestInit, "headers" | "signal"> & {
  headers?: Record<string, string>;
};

export function createCollectorHttp(options: CollectorHttpOptions): CollectorHttp {
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error("createCollectorHttp requires a fetch implementation");
  }

  return new DefaultCollectorHttp(options, fetchImpl);
}

class DefaultCollectorHttp implements CollectorHttp {
  private readonly chain: ChainSlug;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly rateLimit: { perSecond: number; burst: number };
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly headers: Record<string, string>;
  private tokens: number;
  private updatedAt: number;

  constructor(options: CollectorHttpOptions, fetchImpl: typeof fetch) {
    this.chain = options.chain;
    this.fetchImpl = fetchImpl;
    this.now = options.now ?? Date.now;
    this.rateLimit = options.rateLimit ?? DEFAULT_RATE_LIMIT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.headers = {
      Accept: "application/json",
      "User-Agent": DEFAULT_USER_AGENT,
      ...options.headers,
    };
    this.tokens = this.rateLimit.burst;
    this.updatedAt = this.now();
  }

  async request(url: string, init: CollectorHttpRequestInit = {}): Promise<Response> {
    await this.acquireToken();

    try {
      return await this.fetchWithTimeout(url, this.buildInit(init));
    } catch (error) {
      throw new CollectorError(this.chain, "upstream", "Collector request failed", {
        cause: error,
      });
    }
  }

  async getJson<T>(url: string, init: { headers?: Record<string, string> } = {}): Promise<T> {
    const headers = {
      ...this.headers,
      ...init.headers,
    };

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.acquireToken();

      try {
        const response = await this.fetchWithTimeout(url, { headers });

        if (response.status === 401 || response.status === 403) {
          throw new CollectorError(
            this.chain,
            "auth",
            `Collector request rejected with status ${response.status}`,
          );
        }

        if (response.status === 429) {
          if (attempt < this.maxRetries) {
            const retryDelayMs = getRetryDelayMs(response.headers.get("retry-after"), attempt, this.now);
            if (retryDelayMs === null) {
              throw new CollectorError(this.chain, "rate-limit", "Collector request rate limited");
            }

            await sleep(retryDelayMs);
            continue;
          }

          throw new CollectorError(this.chain, "rate-limit", "Collector request rate limited");
        }

        if (response.status >= 500) {
          if (attempt < this.maxRetries) {
            const retryDelayMs = getRetryDelayMs(response.headers.get("retry-after"), attempt, this.now);
            if (retryDelayMs === null) {
              throw new CollectorError(
                this.chain,
                "upstream",
                `Collector request failed with status ${response.status}`,
              );
            }

            await sleep(retryDelayMs);
            continue;
          }

          throw new CollectorError(
            this.chain,
            "upstream",
            `Collector request failed with status ${response.status}`,
          );
        }

        if (!response.ok) {
          throw new CollectorError(
            this.chain,
            "upstream",
            `Collector request failed with status ${response.status}`,
          );
        }

        return await this.readJson<T>(response);
      } catch (error) {
        if (error instanceof CollectorError) {
          throw error;
        }

        if (attempt < this.maxRetries) {
          const retryDelayMs = getRetryDelayMs(null, attempt, this.now);
          await sleep(retryDelayMs ?? DEFAULT_BACKOFF_MS);
          continue;
        }

        throw new CollectorError(this.chain, "upstream", "Collector request failed", {
          cause: error,
        });
      }
    }

    throw new CollectorError(this.chain, "upstream", "Collector request failed");
  }

  private async acquireToken(): Promise<void> {
    while (true) {
      this.refillTokens();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      const waitMs = ((1 - this.tokens) / this.rateLimit.perSecond) * 1_000;
      await sleep(Math.ceil(waitMs));
    }
  }

  private refillTokens(): void {
    const now = this.now();
    const elapsedMs = Math.max(0, now - this.updatedAt);
    this.updatedAt = now;
    this.tokens = Math.min(
      this.rateLimit.burst,
      this.tokens + (elapsedMs / 1_000) * this.rateLimit.perSecond,
    );
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildInit(init: CollectorHttpRequestInit): RequestInit {
    return {
      ...init,
      headers: {
        ...this.headers,
        ...init.headers,
      },
    };
  }

  private async readJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new CollectorError(this.chain, "parse", "Collector response returned invalid JSON", {
        cause: error,
      });
    }
  }

}

export function getRetryDelayMs(
  retryAfter: string | null,
  attempt = 0,
  now: () => number = Date.now,
): number | null {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      const delayMs = Math.max(0, seconds * 1_000);
      return delayMs > MAX_RETRY_DELAY_MS ? null : delayMs;
    }

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      const delayMs = Math.max(0, retryAt - now());
      return delayMs > MAX_RETRY_DELAY_MS ? null : delayMs;
    }
  }

  const exponentialBackoffMs = DEFAULT_BACKOFF_MS * 2 ** attempt;
  return exponentialBackoffMs + Math.floor(Math.random() * DEFAULT_BACKOFF_MS);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
