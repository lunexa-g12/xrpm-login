<?php

declare(strict_types=1);

namespace XrpmLogin\Crypto;

use Elliptic\EC;
use XrpmLogin\Exceptions\XrpmVerifyException;

/**
 * Verifies XRPL ed25519 and secp256k1 signatures.
 *
 * The XRPM app signs SHA256(canonical_message) raw bytes and returns
 * the signature as base64url-encoded raw bytes.
 *
 * ed25519:  uses PHP's built-in sodium extension (RFC 8032, compatible with tweetnacl)
 * secp256k1: uses simplito/elliptic-php (DER-encoded signature)
 */
final class SignatureVerifier
{
    /**
     * Verify the proof signature.
     *
     * @param string $digestRaw   Raw 32-byte SHA256 digest of the canonical message
     * @param string $sigBase64Url  base64url-encoded raw signature bytes (from proof.sig)
     * @param string $pubkeyHex   Hex-encoded public key (from proof.pubkey)
     * @param string $alg         'ed25519' or 'secp256k1'
     *
     * @throws XrpmVerifyException ALG_KEY_MISMATCH if pubkey prefix doesn't match alg
     * @throws XrpmVerifyException INVALID_SIGNATURE if verification fails
     */
    public static function verify(
        string $digestRaw,
        string $sigBase64Url,
        string $pubkeyHex,
        string $alg,
    ): void {
        // Decode signature from base64url → raw bytes
        $sigRaw = self::base64UrlDecode($sigBase64Url);

        $pubkeyHex = strtoupper($pubkeyHex);
        $prefix    = substr($pubkeyHex, 0, 2);

        match ($alg) {
            'ed25519'   => self::verifyEd25519($digestRaw, $sigRaw, $pubkeyHex, $prefix),
            'secp256k1' => self::verifySecp256k1($digestRaw, $sigRaw, $pubkeyHex, $prefix),
            default     => throw new XrpmVerifyException(
                XrpmVerifyException::INVALID_PROOF_SCHEMA,
                "unknown alg: {$alg}",
            ),
        };
    }

    // ─── ed25519 ─────────────────────────────────────────────────────────────

    private static function verifyEd25519(
        string $digestRaw,
        string $sigRaw,
        string $pubkeyHex,
        string $prefix,
    ): void {
        if ($prefix !== 'ED') {
            throw new XrpmVerifyException(
                XrpmVerifyException::ALG_KEY_MISMATCH,
                'ed25519 pubkey must start with ED',
            );
        }

        // Strip the 'ED' prefix byte — sodium expects raw 32 bytes
        $pubkeyRaw = hex2bin(substr($pubkeyHex, 2));
        if ($pubkeyRaw === false || strlen($pubkeyRaw) !== 32) {
            throw new XrpmVerifyException(XrpmVerifyException::INVALID_PUBKEY);
        }

        if (strlen($sigRaw) !== SODIUM_CRYPTO_SIGN_BYTES) {
            throw new XrpmVerifyException(
                XrpmVerifyException::INVALID_SIGNATURE,
                'ed25519 signature must be 64 bytes',
            );
        }

        // sodium_crypto_sign_verify_detached implements RFC 8032 Ed25519
        // Compatible with tweetnacl (used by ripple-keypairs in the mobile app)
        $valid = sodium_crypto_sign_verify_detached($sigRaw, $digestRaw, $pubkeyRaw);

        if (!$valid) {
            throw new XrpmVerifyException(XrpmVerifyException::INVALID_SIGNATURE);
        }
    }

    // ─── secp256k1 ───────────────────────────────────────────────────────────

    private static function verifySecp256k1(
        string $digestRaw,
        string $sigRaw,
        string $pubkeyHex,
        string $prefix,
    ): void {
        if ($prefix !== '02' && $prefix !== '03') {
            throw new XrpmVerifyException(
                XrpmVerifyException::ALG_KEY_MISMATCH,
                'secp256k1 pubkey must start with 02 or 03',
            );
        }

        try {
            $ec  = new EC('secp256k1');
            $key = $ec->keyFromPublic($pubkeyHex, 'hex');

            // elliptic-php verify() accepts DER hex signature and message hash hex
            $digestHex = bin2hex($digestRaw);
            $sigHex    = bin2hex($sigRaw);

            $valid = $key->verify($digestHex, $sigHex);
        } catch (\Throwable $e) {
            throw new XrpmVerifyException(
                XrpmVerifyException::INVALID_SIGNATURE,
                $e->getMessage(),
            );
        }

        if (!$valid) {
            throw new XrpmVerifyException(XrpmVerifyException::INVALID_SIGNATURE);
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static function base64UrlDecode(string $input): string
    {
        $padded = str_replace(['-', '_'], ['+', '/'], $input);
        $mod    = strlen($padded) % 4;
        if ($mod !== 0) {
            $padded .= str_repeat('=', 4 - $mod);
        }
        $decoded = base64_decode($padded, strict: true);
        if ($decoded === false) {
            throw new XrpmVerifyException(
                XrpmVerifyException::INVALID_PROOF_ENCODING,
                'invalid base64url in sig field',
            );
        }
        return $decoded;
    }
}
