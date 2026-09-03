import { ProviderError } from "./types";

const DEFAULT_TIMEOUT = 12_000;

export async function fetchJson<T>(
  provider: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "Chainer/0.1", ...(init.headers || {}) },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderError(provider, `HTTP ${res.status} ${body.slice(0, 200)}`, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    const msg = e instanceof Error ? (e.name === "AbortError" ? "Timeout" : e.message) : String(e);
    throw new ProviderError(provider, msg);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(provider: string, url: string, timeoutMs = DEFAULT_TIMEOUT): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new ProviderError(provider, `HTTP ${res.status}`, res.status);
    return await res.text();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(provider, e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}
