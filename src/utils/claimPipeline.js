import { logger } from './logger.js';

/**
 * FastClaimEngine - High-throughput, non-blocking 1-step claim pipeline.
 * 
 * Executes direct single-step order claims without prerequisite GET queries.
 * Matches the official PWA Burp Suite verified wire format:
 * POST /api/trade-api/trader-cabinet-pwa/payouts/{id}/accept
 * Headers: Content-Type: application/json, Authorization: Bearer <token>
 * Body: null (Content-Length: 0)
 * Credentials: include
 */
export class FastClaimEngine {
  constructor({
    apiBaseUrl = '',
    getHeaders = () => ({}),
    maxConcurrent = 1,
    failedTtlMs = 25000
  } = {}) {
    this.apiBaseUrl = apiBaseUrl;
    this.getHeaders = getHeaders;
    this.maxConcurrent = maxConcurrent;
    this.failedTtlMs = failedTtlMs;

    this.inFlight = new Set();
    this.failedIds = new Map(); // id -> expiryTimestamp
    this.claimedIds = new Set();
  }

  setCachedHeaders(headers) {
    if (headers) {
      this._cachedHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        ...headers
      };
    } else {
      this._cachedHeaders = null;
    }
  }

  /**
   * Checks if an order can be immediately attempted.
   */
  canAttempt(orderId) {
    if (!orderId) return false;
    if (this.claimedIds.has(orderId)) return false;
    if (this.inFlight.has(orderId)) return false;
    if (this.inFlight.size >= this.maxConcurrent) return false;

    const now = Date.now();
    const expiry = this.failedIds.get(orderId);
    if (expiry) {
      if (now < expiry) return false;
      this.failedIds.delete(orderId);
    }

    // High-efficiency self-cleaning: purge expired IDs if map exceeds 100 entries
    if (this.failedIds.size > 100) {
      for (const [fId, exp] of this.failedIds.entries()) {
        if (now >= exp) this.failedIds.delete(fId);
      }
    }
    return true;
  }

  /**
   * Fires direct single-step claim attempt with atomic in-flight micro-retry for debounce lock contention.
   */
  async claimOrder(order) {
    const id = order.id || order.orderId || order.payoutId || order._id;
    if (!id || !this.canAttempt(id)) {
      return { ok: false, error: 'Cannot attempt order claim (busy, in-flight, or cooled down)' };
    }

    // Lock order in-flight immediately to prevent duplicate concurrent claim attempts
    this.inFlight.add(id);
    const overallStartTime = Date.now();
    logger.info('CLAIM', `⚡ Firing claim for order ${id.slice(0, 8)} (₹${order.fiatAmount || order.buyAmount || '?'})`);

    try {
      const url = `${this.apiBaseUrl}/api/trade-api/trader-cabinet-pwa/payouts/${id}/accept`;
      const headers = this._cachedHeaders || {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        ...(typeof this.getHeaders === 'function' ? this.getHeaders() : (this.getHeaders || {}))
      };

      // Fast micro-rebound: 1 immediate check + 3 micro-retries at [120, 350, 750]ms (4 attempts max)
      // Anti-ban backoff: Max 2 attempts with natural jitter to eliminate robotic retry signatures
      const backoffCurve = [450];
      const maxAttempts = backoffCurve.length + 1; // 2 attempts maximum

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // If a competitor claimed the order while we were waiting, abort retry immediately
        const competitorExpiry = this.failedIds.get(id);
        if (competitorExpiry && competitorExpiry > Date.now() + 10000) {
          logger.warn('CLAIM', `Order ${id.slice(0, 8)} claimed by competitor during micro-retry wait. Aborting retry.`);
          return { ok: false, error: 'Order claimed by competitor' };
        }

        const attemptStartTime = Date.now();
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({}), // Exact PWA wire format: empty JSON object {}
          priority: 'high',
          credentials: 'include',
          keepalive: true
        });

        const latency = Date.now() - attemptStartTime;
        let data = null;
        try {
          data = await response.json();
        } catch {
          // Keep null if response has no JSON body
        }

        const errorMsg = data?.message || data?.error || '';

        if (response.ok) {
          this.failedIds.delete(id);
          this.claimedIds.add(id);
          // Prune claimedIds to a rolling window of 150 entries to keep long-running heap usage constant
          if (this.claimedIds.size > 150) {
            const oldest = this.claimedIds.values().next().value;
            this.claimedIds.delete(oldest);
          }
          logger.success('CLAIM', `🎉 Claim CONFIRMED for ${id.slice(0, 8)} in ${Date.now() - overallStartTime}ms (attempt ${attempt}/${maxAttempts})!`, data);
          return { ok: true, status: response.status, latency: Date.now() - overallStartTime, data };
        }

        const isDebounce = response.status === 429 && (data?.error === 'ERROR_DEBOUNCE' || String(errorMsg).toLowerCase().includes('processed'));

        if (isDebounce && attempt < maxAttempts) {
          const baseBackoff = backoffCurve[attempt - 1];
          // Natural anti-bot micro-jitter (±10ms): eliminates rigid robotic retry signatures
          const jitter = Math.floor(Math.random() * 21) - 10;
          const backoffMs = Math.max(50, baseBackoff + jitter);
          logger.info('CLAIM', `⏳ Debounce lock on ${id.slice(0, 8)}: micro-rebound in ${backoffMs}ms (attempt ${attempt + 1}/${maxAttempts})...`);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        // Smart Debounce Cooldown:
        // If rejected with ERROR_DEBOUNCE, use a short 1,500ms cooldown so our bot can re-probe
        // the order if it remains alive on the exchange after the server lock clears.
        // Permanent failures (taken by competitor, 404, 410) retain the full failedTtlMs cooldown.
        this.failedIds.set(id, Date.now() + (isDebounce ? 1500 : this.failedTtlMs));

        logger.warn('CLAIM', `Claim rejected for ${id.slice(0, 8)} (HTTP ${response.status}, ${latency}ms): ${errorMsg || 'Contention'}`, data);
        return {
          ok: false,
          status: response.status,
          isDebounce,
          latency: Date.now() - overallStartTime,
          data,
          error: errorMsg || `Claim rejected (HTTP ${response.status})`
        };
      }
    } catch (err) {
      this.failedIds.set(id, Date.now() + this.failedTtlMs);
      logger.error('CLAIM', `Network error claiming ${id.slice(0, 8)}: ${err.message}`);
      return { ok: false, latency: Date.now() - overallStartTime, error: err.message };
    } finally {
      this.inFlight.delete(id);
    }
  }

  /**
   * Resets all in-flight and cooldown states.
   */
  reset() {
    this.inFlight.clear();
    this.failedIds.clear();
    this.claimedIds.clear();
  }
}
