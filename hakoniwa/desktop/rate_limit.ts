// Sliding-window rate limiter for IPC channels (docs/50_tech/release_engineering.md 2.3:
// hk:log at most 50 a second; model listing and connection tests at most 10 a minute).
// The clock is injected so tests drive it; the shell passes Date.now.

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly now: () => number) {}

  /** Record one call in `bucket` and say whether it is within `max` per `windowMs`. */
  allow(bucket: string, max: number, windowMs: number): boolean {
    const t = this.now();
    const list = (this.hits.get(bucket) ?? []).filter((at) => t - at < windowMs);
    if (list.length >= max) {
      this.hits.set(bucket, list);
      return false;
    }
    list.push(t);
    this.hits.set(bucket, list);
    return true;
  }
}
