/**
 * Simple token bucket rate limiter to prevent API abuse
 * Limits number of requests within a sliding time window
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  /**
   * Check if request is allowed. Returns true if allowed, false if rate limit exceeded.
   * Automatically records the request if allowed.
   */
  check(): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter((t) => t > cutoff);

    // Check if we're at the limit
    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    // Record this request
    this.timestamps.push(now);
    return true;
  }

  /**
   * Get current request count within the window
   */
  getCurrentCount(): number {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
    return this.timestamps.length;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.timestamps = [];
  }
}
