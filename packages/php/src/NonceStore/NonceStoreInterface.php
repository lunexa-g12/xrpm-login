<?php

declare(strict_types=1);

namespace XrpmLogin\NonceStore;

/**
 * Every nonce must be:
 *   - Accepted on first use and stored with a TTL.
 *   - Rejected on every subsequent use (replay attack prevention).
 *
 * Implementations MUST use an atomic operation (INSERT ON CONFLICT,
 * SET NX, etc.) to prevent two simultaneous requests with the same
 * nonce from both returning true.
 */
interface NonceStoreInterface
{
    /**
     * Attempt to consume a nonce.
     *
     * @param string $nonce      The nonce from the proof.
     * @param int    $ttlSeconds How long to remember this nonce (= proof TTL).
     *
     * @return bool true = first use (accepted), false = already used (replay).
     */
    public function consume(string $nonce, int $ttlSeconds): bool;
}
