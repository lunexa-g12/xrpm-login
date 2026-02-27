<?php

declare(strict_types=1);

namespace XrpmLogin;

use XrpmLogin\Crypto\AddressDeriver;
use XrpmLogin\Crypto\CanonicalMessage;
use XrpmLogin\Crypto\SignatureVerifier;
use XrpmLogin\Exceptions\XrpmVerifyException;
use XrpmLogin\NonceStore\NonceStoreInterface;

/**
 * Verifies XRPM_LOGIN_V1 proofs.
 *
 * Performs all 10 verification steps defined in the spec.
 * Throws XrpmVerifyException with a typed code on any failure.
 * Never returns a partial success.
 *
 * DISCLAIMER: This SDK verifies wallet ownership at the time of login only.
 * The XRPM balance check is a point-in-time snapshot.
 * Read DISCLAIMER.md before integrating.
 *
 * @example
 *   $verifier = new Verifier(
 *       expectedAud:         'https://mysite.com',
 *       expectedRedirectUri: 'https://mysite.com/auth/callback',
 *       nonceStore:          new PdoNonceStore($pdo),
 *   );
 *
 *   try {
 *       $result = $verifier->verify($_GET['proof']);
 *       $_SESSION['user'] = $result['address'];
 *   } catch (XrpmVerifyException $e) {
 *       error_log('XRPM login failed: ' . $e->getErrorCode());
 *       header('Location: /login?error=' . urlencode($e->getErrorCode()));
 *   }
 */
class Verifier
{
    public function __construct(
        private readonly string               $expectedAud,
        private readonly string               $expectedRedirectUri,
        private readonly NonceStoreInterface  $nonceStore,
        private readonly bool                 $checkXrpm = true,
        private readonly ?XRPLClient          $xrpl      = null,
    ) {}

    /**
     * Verify a base64url-encoded proof received from the XRPM app callback.
     *
     * @return array{address: string, balance: string}
     *
     * @throws XrpmVerifyException on any verification failure
     */
    public function verify(string $proofBase64Url): array
    {
        // Step 1: Decode base64url → JSON
        $proof = $this->decodeProof($proofBase64Url);

        // Step 2: Validate schema and version
        $this->assertSchema($proof);

        // Step 3: aud must match exactly (cross-site replay prevention)
        if ($proof['aud'] !== $this->expectedAud) {
            throw new XrpmVerifyException(
                XrpmVerifyException::AUD_MISMATCH,
                "expected {$this->expectedAud}, got {$proof['aud']}",
            );
        }

        // Step 4: Expiry enforced server-side
        $now = time();
        if ($proof['exp'] <= $now) {
            throw new XrpmVerifyException(
                XrpmVerifyException::PROOF_EXPIRED,
                "expired at {$proof['exp']}, now is {$now}",
            );
        }

        // Step 5: Nonce replay prevention (atomic consume)
        $ttl      = $proof['exp'] - $now;
        $consumed = $this->nonceStore->consume($proof['nonce'], $ttl);
        if (!$consumed) {
            throw new XrpmVerifyException(XrpmVerifyException::NONCE_ALREADY_USED);
        }

        // Step 6–7: Canonical message + SHA256 (raw bytes)
        $canonical = CanonicalMessage::build(
            aud:      $proof['aud'],
            nonce:    $proof['nonce'],
            iat:      (int) $proof['iat'],
            exp:      (int) $proof['exp'],
            clientId: $proof['client_id'],
        );
        $digest = CanonicalMessage::hash($canonical);

        // Step 8: Verify signature (throws XrpmVerifyException on failure)
        SignatureVerifier::verify($digest, $proof['sig'], $proof['pubkey'], $proof['alg']);

        // Step 9: Address must match pubkey (throws XrpmVerifyException on failure)
        AddressDeriver::assertMatches($proof['pubkey'], $proof['account']);

        // Step 10: On-chain XRPM eligibility check
        // The app-side check is for UX only — always re-verify server-side
        $balance = '0';
        if ($this->checkXrpm) {
            $client  = $this->xrpl ?? new XRPLClient();
            $activated = $client->checkActivated($proof['account']);

            if (!$activated) {
                throw new XrpmVerifyException(XrpmVerifyException::ACCOUNT_NOT_ACTIVATED);
            }

            $balance = $client->getXrpmBalance($proof['account']);
            if ((float) $balance < Constants::XRPM_MIN_BALANCE) {
                throw new XrpmVerifyException(
                    XrpmVerifyException::INSUFFICIENT_XRPM,
                    "balance {$balance} < required " . Constants::XRPM_MIN_BALANCE,
                );
            }
        }

        return ['address' => $proof['account'], 'balance' => $balance];
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    private function decodeProof(string $proofBase64Url): array
    {
        $padded  = str_replace(['-', '_'], ['+', '/'], $proofBase64Url);
        $mod     = strlen($padded) % 4;
        if ($mod !== 0) $padded .= str_repeat('=', 4 - $mod);

        $json = base64_decode($padded, strict: true);
        if ($json === false) {
            throw new XrpmVerifyException(XrpmVerifyException::INVALID_PROOF_ENCODING);
        }

        $proof = json_decode($json, true);
        if (!is_array($proof)) {
            throw new XrpmVerifyException(
                XrpmVerifyException::INVALID_PROOF_ENCODING,
                'proof is not valid JSON',
            );
        }

        return $proof;
    }

    private function assertSchema(array $proof): void
    {
        foreach (['v', 'aud', 'nonce', 'iat', 'exp', 'client_id', 'account', 'pubkey', 'alg', 'sig'] as $field) {
            if (!isset($proof[$field])) {
                throw new XrpmVerifyException(
                    XrpmVerifyException::INVALID_PROOF_SCHEMA,
                    "missing field: {$field}",
                );
            }
        }

        if ($proof['v'] !== 1) {
            throw new XrpmVerifyException(
                XrpmVerifyException::UNSUPPORTED_VERSION,
                "expected v=1, got v={$proof['v']}",
            );
        }

        if (!in_array($proof['alg'], ['ed25519', 'secp256k1'], strict: true)) {
            throw new XrpmVerifyException(
                XrpmVerifyException::INVALID_PROOF_SCHEMA,
                "unknown alg: {$proof['alg']}",
            );
        }
    }
}
