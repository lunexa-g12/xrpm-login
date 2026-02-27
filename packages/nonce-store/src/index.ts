/**
 * @xrpm-login/nonce-store
 *
 * Pluggable nonce store adapters for XRPM_LOGIN_V1 replay attack prevention.
 *
 * Every nonce MUST be:
 *   - Stored on first use with a TTL equal to the proof's remaining lifetime.
 *   - Rejected on any subsequent use (single-use guarantee).
 *
 * Choose the adapter that fits your infrastructure:
 *   - MemoryNonceStore     → development / single-process only
 *   - RedisNonceStore      → production, horizontally scalable
 *   - PostgresNonceStore   → production, if you already run Postgres
 *
 * @see https://github.com/xrpmemes/xrpm-login/spec/XRPM_LOGIN_V1.md (§9 Replay Prevention)
 */

/**
 * The NonceStore interface that all adapters implement.
 *
 * Implementations MUST be safe for concurrent use.
 * For distributed systems, use an atomic check-and-set (Redis SET NX, Postgres INSERT ON CONFLICT).
 */
export interface NonceStore {
  /**
   * Attempt to consume a nonce.
   *
   * - Returns `true` if the nonce was new and has been marked as used.
   * - Returns `false` if the nonce was already used (replay attack).
   *
   * Implementations MUST use an atomic operation so that two simultaneous
   * requests with the same nonce cannot both return `true`.
   */
  consume(nonce: string, ttlSeconds: number): Promise<boolean>;
}

export { MemoryNonceStore } from './memory';
export { RedisNonceStore } from './redis';
export { PostgresNonceStore } from './postgres';
