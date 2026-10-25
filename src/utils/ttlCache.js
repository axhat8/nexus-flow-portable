/**
 * TtlCache - Time-to-Live bounded cache
 * Prevents permanent blacklisting of transiently failed orders.
 */
export class TtlCache {
  constructor(defaultTtlMs = 30000) {
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Check if ID exists and is still valid.
   * Evicts expired entry on read.
   */
  has(id) {
    if (!this.cache.has(id)) return false;
    const expiry = this.cache.get(id);
    if (Date.now() >= expiry) {
      this.cache.delete(id);
      return false;
    }
    return true;
  }

  /**
   * Add an ID with a specified or default TTL in ms.
   */
  add(id, ttlMs = this.defaultTtlMs) {
    if (!id) return;
    this.cache.set(id, Date.now() + ttlMs);
  }

  /**
   * Delete an ID explicitly.
   */
  delete(id) {
    return this.cache.delete(id);
  }

  /**
   * Periodic sweep to remove expired entries and keep memory bounded.
   */
  sweep() {
    const now = Date.now();
    for (const [id, expiry] of this.cache.entries()) {
      if (now >= expiry) {
        this.cache.delete(id);
      }
    }
  }

  /**
   * Clear all entries.
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Current active size (sweeps expired first).
   */
  get size() {
    this.sweep();
    return this.cache.size;
  }
}
