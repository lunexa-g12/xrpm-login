<?php

declare(strict_types=1);

namespace XrpmLogin\Crypto;

use XrpmLogin\Constants;

/**
 * Builds and hashes the XRPM_LOGIN_V1 canonical message.
 */
final class CanonicalMessage
{
    /**
     * Build the canonical message string.
     *
     * Format is exact per spec — newline-separated, no trailing newline.
     */
    public static function build(
        string $aud,
        string $nonce,
        int    $iat,
        int    $exp,
        string $clientId,
    ): string {
        return implode("\n", [
            Constants::PROTOCOL_VERSION,
            "aud={$aud}",
            "nonce={$nonce}",
            "iat={$iat}",
            "exp={$exp}",
            "client_id={$clientId}",
        ]);
    }

    /**
     * SHA256 of the canonical message (raw bytes, not hex).
     * This is the exact bytes that the XRPM app signed.
     */
    public static function hash(string $canonical): string
    {
        return hash('sha256', $canonical, true); // true = raw binary output
    }
}
