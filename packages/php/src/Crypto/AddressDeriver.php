<?php

declare(strict_types=1);

namespace XrpmLogin\Crypto;

use XrpmLogin\Constants;
use XrpmLogin\Exceptions\XrpmVerifyException;

/**
 * Derives the XRPL classic address (rAddress) from a hex public key,
 * then asserts it matches the claimed account in the proof.
 *
 * XRPL address derivation:
 *   1. pubkey_bytes = hex2bin(pubkeyHex)               — 33 bytes
 *   2. account_id  = RIPEMD160(SHA256(pubkey_bytes))   — 20 bytes
 *   3. payload     = 0x00 + account_id                 — 21 bytes
 *   4. checksum    = SHA256(SHA256(payload))[0:4]       —  4 bytes
 *   5. address     = base58encode(payload + checksum, XRPL_ALPHABET)
 */
final class AddressDeriver
{
    public static function assertMatches(string $pubkeyHex, string $claimedAccount): void
    {
        try {
            $derived = self::derive($pubkeyHex);
        } catch (\Throwable $e) {
            throw new XrpmVerifyException(
                XrpmVerifyException::INVALID_PUBKEY,
                $e->getMessage(),
            );
        }

        if ($derived !== $claimedAccount) {
            throw new XrpmVerifyException(
                XrpmVerifyException::ADDRESS_PUBKEY_MISMATCH,
                "derived {$derived}, claimed {$claimedAccount}",
            );
        }
    }

    public static function derive(string $pubkeyHex): string
    {
        $pubkeyBytes = hex2bin(strtolower($pubkeyHex));
        if ($pubkeyBytes === false || strlen($pubkeyBytes) !== 33) {
            throw new \InvalidArgumentException('Public key must be 33 bytes (66 hex chars)');
        }

        // Step 1: SHA256 then RIPEMD160
        $sha256    = hash('sha256', $pubkeyBytes, true);
        $accountId = hash('ripemd160', $sha256, true);        // 20 bytes

        // Step 2: prepend version byte 0x00
        $payload = "\x00" . $accountId;                       // 21 bytes

        // Step 3: double-SHA256 checksum (first 4 bytes)
        $checksum = substr(hash('sha256', hash('sha256', $payload, true), true), 0, 4);

        // Step 4: base58check encode with XRPL custom alphabet
        return self::base58Encode($payload . $checksum);
    }

    private static function base58Encode(string $bytes): string
    {
        $alphabet = Constants::BASE58_ALPHABET;
        $leadingZeros = 0;
        for ($i = 0; $i < strlen($bytes) && $bytes[$i] === "\x00"; $i++) {
            $leadingZeros++;
        }

        // Convert bytes to a big integer
        $num = gmp_init(bin2hex($bytes), 16);
        $base = gmp_init(58);

        $result = '';
        while (gmp_cmp($num, 0) > 0) {
            [$num, $rem] = gmp_div_qr($num, $base);
            $result = $alphabet[gmp_intval($rem)] . $result;
        }

        return str_repeat($alphabet[0], $leadingZeros) . $result;
    }
}
