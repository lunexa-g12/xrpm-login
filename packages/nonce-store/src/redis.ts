import type { NonceStore } from './index';

/**
 * Redis nonce store — recommended for production.
 *
 * Uses SET ... NX EX which is atomic — safe for multi-server deployments.
 * Two simultaneous requests with the same nonce cannot both succeed.
 *
 * Install the peer dependency:
 *   npm install ioredis
 *
 * @example
 * import Redis from 'ioredis';
 * import { RedisNonceStore } from '@xrpm-login/nonce-store/redis';
 *
 * const redis = new Redis(process.env.REDIS_URL);
 * const nonceStore = new RedisNonceStore(redis);
 */
export class RedisNonceStore implements NonceStore {
  private readonly redis: RedisLike;
  private readonly prefix: string;

  /**
   * @param redis   An ioredis client instance (or any client with set/get).
   * @param prefix  Key prefix for all nonces. Default: "xrpm:nonce:".
   */
  constructor(redis: RedisLike, prefix = 'xrpm:nonce:') {
    this.redis = redis;
    this.prefix = prefix;
  }

  async consume(nonce: string, ttlSeconds: number): Promise<boolean> {
    const key = `${this.prefix}${nonce}`;
    // SET key "1" NX EX ttl — returns "OK" if set, null if already exists
    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK'; // true = first use, false = replay
  }
}

/** Minimal interface so callers don't need to import ioredis types directly. */
export interface RedisLike {
  set(
    key: string,
    value: string,
    expiryMode: 'EX',
    time: number,
    setMode: 'NX',
  ): Promise<'OK' | null>;
}
