import type { NonceStore } from './index';

/**
 * In-process memory nonce store.
 *
 * ⚠️  Development / single-process only.
 * This store is NOT safe for multi-process or multi-server deployments.
 * Use RedisNonceStore or PostgresNonceStore in production.
 *
 * Expired entries are purged lazily on consume() calls.
 */
export class MemoryNonceStore implements NonceStore {
  private readonly store = new Map<string, number>(); // nonce → expiry (unix seconds)

  async consume(nonce: string, ttlSeconds: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);

    // Lazy expiry: remove stale entries while we're here
    for (const [key, exp] of this.store) {
      if (exp <= now) this.store.delete(key);
    }

    if (this.store.has(nonce)) {
      return false; // already used — replay attack
    }

    this.store.set(nonce, now + ttlSeconds);
    return true; // first use — accepted
  }

  /** Number of active (non-expired) nonces. Useful for tests. */
  size(): number {
    const now = Math.floor(Date.now() / 1000);
    let count = 0;
    for (const exp of this.store.values()) {
      if (exp > now) count++;
    }
    return count;
  }
}
