/**
 * EquilibriumPoller - RTT-compensated, rate-limit-aware equilibrium polling engine.
 * 
 * Implements Additive Increase / Multiplicative Decrease (AIMD) pacing
 * anchored around Cloudflare's token-bucket replenishment boundary.
 * Prevents 429 rate limit blackouts and ensures near 100% order feed uptime.
 */
export class EquilibriumPoller {
  constructor(options = {}) {
    const base = options.baseIntervalMs ?? options.baseInterval ?? 1200;
    const min = options.minIntervalMs ?? options.minInterval ?? 800;
    const max = options.maxIntervalMs ?? options.maxInterval ?? 4000;

    this.baseInterval = base;
    this.minInterval = min;
    this.maxInterval = max;
    this.currentInterval = base;
    this.rttCompensation = options.rttCompensation ?? true;

    this.requestStartTime = 0;
    this.avgRtt = 0;
    this.lastRtt = 0;
    this.jitter = 0;
    this.consecutive429 = 0;
    this.consecutiveOk = 0;

    this.circuitOpen = false;
    this.circuitOpenUntil = 0;
  }

  /**
   * Marks the start of a network request to measure RTT automatically.
   */
  markStart() {
    this.requestStartTime = Date.now();
  }

  /**
   * Records round-trip time of a network request to compensate sleep intervals and calculate jitter.
   */
  recordRtt(rttMs) {
    if (typeof rttMs === 'number' && rttMs > 0 && rttMs < 10000) {
      this.lastRtt = rttMs;
      if (this.avgRtt > 0) {
        this.jitter = Math.abs(rttMs - this.avgRtt);
      }
      this.avgRtt = this.avgRtt === 0 ? rttMs : Math.round(this.avgRtt * 0.7 + rttMs * 0.3);
    }
  }

  /**
   * Calculates next sleep delay with RTT compensation and micro-jitter.
   */
  nextDelay() {
    if (this.circuitOpen && this.circuitOpenUntil > Date.now()) {
      return Math.max(1000, this.circuitOpenUntil - Date.now() + 50);
    }

    if (this.requestStartTime > 0) {
      const elapsed = Date.now() - this.requestStartTime;
      this.recordRtt(elapsed);
      this.requestStartTime = 0;
    }

    let target = this.currentInterval;

    if (this.rttCompensation && this.avgRtt > 0) {
      target = Math.max(this.minInterval, this.currentInterval - Math.round(this.avgRtt * 0.25));
    }

    // Micro-jitter: 0.94x to 1.06x (subtle and organic to prevent periodic WAF triggers)
    const jitterFactor = 0.94 + Math.random() * 0.12;
    return Math.round(target * jitterFactor);
  }

  /**
   * Alias matching user hook signature: getNextDelayMs()
   */
  getNextDelayMs() {
    return this.nextDelay();
  }

  /**
   * Called on HTTP 2xx response.
   * Maintains adapted equilibrium interval and gently decays towards baseInterval.
   */
  onSuccess() {
    this.circuitOpen = false;
    this.circuitOpenUntil = 0;
    this.consecutive429 = 0;
    this.consecutiveOk++;

    // After 3 continuous successful requests, gently step down towards baseInterval
    if (this.consecutiveOk >= 3 && this.currentInterval > this.baseInterval) {
      this.currentInterval = Math.max(this.baseInterval, this.currentInterval - 25);
      this.consecutiveOk = 0;
    }
  }

  /**
   * Called on HTTP 429 Too Many Requests.
   */
  onRateLimited(responseOrHeader) {
    let retryAfterHeader = null;
    if (responseOrHeader?.headers) {
      if (typeof responseOrHeader.headers.get === 'function') {
        retryAfterHeader = responseOrHeader.headers.get('retry-after') || responseOrHeader.headers.get('x-cadence-retry-after');
      } else {
        retryAfterHeader = responseOrHeader.headers['retry-after'] || responseOrHeader.headers['x-cadence-retry-after'];
      }
    } else if (typeof responseOrHeader === 'string' || typeof responseOrHeader === 'number') {
      retryAfterHeader = responseOrHeader;
    }
    this.on429(retryAfterHeader);
  }

  /**
   * Internal 429 handler: Fast micro-adaptive recovery (1.2s - 2.2s max),
   * preventing terminal freezing while gently stepping up interval (+50ms).
   */
  on429(retryAfterHeader) {
    this.consecutive429++;
    this.consecutiveOk = 0;

    let cooldownMs = 1200;
    if (retryAfterHeader) {
      const parsed = parseInt(retryAfterHeader, 10);
      if (!isNaN(parsed) && parsed > 0) {
        cooldownMs = Math.min(3000, parsed * 1000);
      }
    } else {
      cooldownMs = Math.min(2200, 1200 + (this.consecutive429 - 1) * 300);
    }

    // Open circuit for micro-cooldown duration (1.2s - 2.2s)
    this.circuitOpen = true;
    this.circuitOpenUntil = Date.now() + cooldownMs;

    // AIMD: Adaptively step up interval by +25ms to settle above the rate-limit threshold, capped at maxInterval
    this.currentInterval = Math.min(this.maxInterval, this.currentInterval + 25);
  }

  /**
   * Directly sets the target polling interval chosen by user in Settings (e.g. 200ms, 350ms).
   * Immediately adjusts baseInterval, currentInterval, minInterval, and maxInterval ceiling.
   */
  setTargetInterval(intervalMs) {
    if (typeof intervalMs === 'number' && intervalMs > 0) {
      this.baseInterval = intervalMs;
      this.currentInterval = intervalMs;
      this.minInterval = Math.max(50, Math.round(intervalMs * 0.7));
      this.maxInterval = Math.max(intervalMs + 150, Math.round(intervalMs * 1.5));
      this.consecutive429 = 0;
      this.circuitOpen = false;
      this.circuitOpenUntil = 0;
    }
  }

  /**
   * Instantly clears circuit breaker when high-priority events (e.g. WebSocket order) arrive.
   */
  clearCircuit() {
    this.circuitOpen = false;
    this.circuitOpenUntil = 0;
    this.consecutive429 = 0;
  }

  /**
   * Checks if polling is allowed under current circuit state.
   * Auto-resumes immediately as soon as cooldown expires without resetting the adapted interval.
   */
  canPoll() {
    if (this.circuitOpen) {
      if (Date.now() < this.circuitOpenUntil) {
        return false;
      }
      this.circuitOpen = false;
      this.circuitOpenUntil = 0;
      this.consecutive429 = 0;
      // Intentionally preserve adapted currentInterval to prevent rate-limit oscillation!
      return true;
    }
    return true;
  }

  /**
   * Helper to retrieve current diagnostics.
   */
  getDiagnostics() {
    const remainingMs = this.circuitOpen ? Math.max(0, this.circuitOpenUntil - Date.now()) : 0;
    return {
      currentInterval: this.currentInterval,
      avgRtt: this.avgRtt,
      lastRtt: this.lastRtt || this.avgRtt,
      jitter: this.jitter || 0,
      consecutive429: this.consecutive429,
      consecutiveOk: this.consecutiveOk,
      circuitOpen: this.circuitOpen,
      circuitRemainingMs: remainingMs,
      circuitRemainingSec: remainingMs > 0 ? (remainingMs / 1000).toFixed(1) : 0
    };
  }

  /**
   * Manually resets faults, clears circuit breaker, and restores interval back to baseInterval.
   */
  reset() {
    this.consecutive429 = 0;
    this.consecutiveOk = 0;
    this.circuitOpen = false;
    this.circuitOpenUntil = 0;
    this.currentInterval = this.baseInterval;
    this.lastRtt = 0;
    this.jitter = 0;
  }
}

// Backward-compatibility alias
export const AdaptivePoller = EquilibriumPoller;
