import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCollectorHttp } from "./http.js";

describe("createCollectorHttp", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits when the rate-limit bucket is empty", async () => {
    vi.useFakeTimers();
    let now = 0;
    const fetchMock = queuedFetch([jsonResponse({ ok: 1 }), jsonResponse({ ok: 2 })]);
    const http = createCollectorHttp({
      chain: "target",
      fetch: fetchMock,
      now: () => now,
      rateLimit: { perSecond: 1, burst: 1 },
    });

    await expect(http.getJson("https://example.test/one")).resolves.toEqual({ ok: 1 });

    const pending = http.getJson("https://example.test/two");
    await vi.advanceTimersByTimeAsync(999);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    now = 1_000;
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ ok: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries 429 responses after Retry-After elapses", async () => {
    vi.useFakeTimers();
    const fetchMock = queuedFetch([
      new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
      jsonResponse({ data: [] }),
    ]);
    const http = createCollectorHttp({ chain: "kroger", fetch: fetchMock });

    const pending = http.getJson("https://example.test/products");
    await vi.advanceTimersByTimeAsync(1_999);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ data: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry 403 responses", async () => {
    const fetchMock = queuedFetch([new Response(null, { status: 403 })]);
    const http = createCollectorHttp({ chain: "target", fetch: fetchMock });

    await expect(http.getJson("https://example.test/forbidden")).rejects.toMatchObject({
      chain: "target",
      kind: "auth",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps timeouts to upstream errors", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const http = createCollectorHttp({
      chain: "target",
      fetch: fetchMock,
      timeoutMs: 25,
      maxRetries: 0,
    });

    const pending = http.getJson("https://example.test/slow");
    const assertion = expect(pending).rejects.toMatchObject({
      chain: "target",
      kind: "upstream",
    });
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
  });

  it("maps invalid JSON responses to parse errors", async () => {
    const fetchMock = queuedFetch([
      new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } }),
    ]);
    const http = createCollectorHttp({ chain: "kroger", fetch: fetchMock });

    await expect(http.getJson("https://example.test/bad-json")).rejects.toMatchObject({
      chain: "kroger",
      kind: "parse",
    });
  });

  it("merges default, instance, and request headers", async () => {
    const fetchMock = queuedFetch([jsonResponse({ ok: true })]);
    const http = createCollectorHttp({
      chain: "target",
      fetch: fetchMock,
      headers: {
        Accept: "application/vnd.collector+json",
        Authorization: "Bearer instance",
        "X-Instance": "yes",
      },
    });

    await expect(
      http.getJson("https://example.test/headers", {
        headers: {
          Authorization: "Bearer request",
          "X-Request": "yes",
        },
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Accept: "application/vnd.collector+json",
      Authorization: "Bearer request",
      "User-Agent": expect.stringContaining("Mozilla/5.0"),
      "X-Instance": "yes",
      "X-Request": "yes",
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function queuedFetch(responses: Response[]) {
  return vi.fn<typeof fetch>(async () => {
    const response = responses.shift();

    if (!response) {
      throw new Error("Unexpected fetch call");
    }

    return response;
  });
}
