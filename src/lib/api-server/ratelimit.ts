import { tooManyRequests } from "./errors";

/**
 * In-memory sliding-window rate limiter (plannings/04 D5). Suitable for the
 * single-instance V1 deployment; a multi-instance deployment needs a shared
 * store (documented follow-up, not a silent gap).
 */

const windows = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    windows.set(key, hits);
    throw tooManyRequests();
  }
  hits.push(now);
  windows.set(key, hits);
  if (windows.size > 10_000) {
    // prevent unbounded growth from key churn
    for (const [k, v] of windows) {
      if (v.every((t) => now - t >= windowMs)) windows.delete(k);
    }
  }
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/** Test hook. */
export function resetRateLimits(): void {
  windows.clear();
}
