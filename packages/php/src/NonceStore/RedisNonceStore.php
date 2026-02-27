<?php

declare(strict_types=1);

namespace XrpmLogin\NonceStore;

/**
 * Redis nonce store — recommended for production with multiple PHP workers.
 *
 * Uses SET NX EX (atomic check-and-set). Safe for multi-process / multi-server.
 *
 * Works with both ext-redis and Predis. Pass any object with a compatible
 * set() method.
 *
 * @example with ext-redis:
 *   $redis = new \Redis();
 *   $redis->connect('127.0.0.1', 6379);
 *   $store = new RedisNonceStore($redis);
 *
 * @example with Predis:
 *   $redis = new \Predis\Client(['host' => '127.0.0.1']);
 *   $store = new RedisNonceStore($redis);
 */
class RedisNonceStore implements NonceStoreInterface
{
    public function __construct(
        private readonly mixed $redis,
        private readonly string $prefix = 'xrpm:nonce:',
    ) {}

    public function consume(string $nonce, int $ttlSeconds): bool
    {
        $key = $this->prefix . $nonce;

        // SET key "1" NX EX ttl — atomic, returns OK/true only if key was new
        $result = $this->redis->set($key, '1', 'EX', $ttlSeconds, 'NX');

        // ext-redis returns true/false; Predis returns Status object or null
        return $result !== false && $result !== null;
    }
}
