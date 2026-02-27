<?php

declare(strict_types=1);

namespace XrpmLogin\NonceStore;

/**
 * In-process array nonce store.
 *
 * ⚠️  For testing and development only.
 * State is lost on every request — provides NO replay protection in production.
 * Use PdoNonceStore or RedisNonceStore in production.
 */
class ArrayNonceStore implements NonceStoreInterface
{
    /** @var array<string, int> nonce → expiry unix timestamp */
    private array $store = [];

    public function consume(string $nonce, int $ttlSeconds): bool
    {
        $now = time();

        // Lazy-purge expired entries
        foreach ($this->store as $key => $exp) {
            if ($exp <= $now) unset($this->store[$key]);
        }

        if (isset($this->store[$nonce])) {
            return false; // already used
        }

        $this->store[$nonce] = $now + $ttlSeconds;
        return true;
    }
}
