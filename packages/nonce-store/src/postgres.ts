import type { NonceStore } from './index';

/**
 * PostgreSQL nonce store — production-ready alternative to Redis.
 *
 * Requires a table in your database:
 *
 *   CREATE TABLE xrpm_nonces (
 *     nonce TEXT PRIMARY KEY,
 *     expires_at TIMESTAMPTZ NOT NULL
 *   );
 *
 *   -- Optional: auto-delete expired rows
 *   CREATE INDEX ON xrpm_nonces (expires_at);
 *
 * Uses INSERT ... ON CONFLICT DO NOTHING which is atomic.
 *
 * Install the peer dependency:
 *   npm install pg
 *
 * @example
 * import { Pool } from 'pg';
 * import { PostgresNonceStore } from '@xrpm-login/nonce-store/postgres';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const nonceStore = new PostgresNonceStore(pool);
 */
export class PostgresNonceStore implements NonceStore {
  private readonly pool: PoolLike;
  private readonly table: string;

  /**
   * @param pool   A pg.Pool instance.
   * @param table  Table name. Default: "xrpm_nonces".
   */
  constructor(pool: PoolLike, table = 'xrpm_nonces') {
    this.pool = pool;
    this.table = table;
  }

  async consume(nonce: string, ttlSeconds: number): Promise<boolean> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    // INSERT ... ON CONFLICT DO NOTHING — atomic, returns rowCount=1 on insert, 0 on conflict
    const result = await this.pool.query(
      `INSERT INTO ${this.table} (nonce, expires_at)
       VALUES ($1, $2)
       ON CONFLICT (nonce) DO NOTHING`,
      [nonce, expiresAt],
    );

    return (result.rowCount ?? 0) > 0; // true = first use, false = replay
  }

  /**
   * Purge expired nonces. Call this periodically (e.g. a cron job).
   * Redis handles expiry automatically; Postgres does not.
   */
  async purgeExpired(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM ${this.table} WHERE expires_at <= NOW()`,
    );
    return result.rowCount ?? 0;
  }
}

/** Minimal interface so callers don't need to import pg types directly. */
export interface PoolLike {
  query(sql: string, params?: unknown[]): Promise<{ rowCount?: number | null }>;
}
