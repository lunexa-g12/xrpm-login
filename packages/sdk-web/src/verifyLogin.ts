import {
  decodeProof,
  buildCanonical,
  hashCanonical,
  verifySignature,
  assertAddressMatchesPubkey,
  XrpmVerifyError,
  type Proof,
} from '@xrpm-login/verifier';
import {
  checkEligibility,
  type EligibilityResult,
  type EligibilityOptions,
} from '@xrpm-login/eligibility';
import type { NonceStore } from '@xrpm-login/nonce-store';

export interface VerifyLoginOptions {
  /** Must match the aud you passed to createChallenge() exactly. */
  expectedAud: string;
  /** Must match the redirect_uri you passed to createChallenge() exactly. */
  expectedRedirectUri: string;
  /**
   * Nonce store for replay prevention.
   * Required in production. Use MemoryNonceStore for development.
   */
  nonceStore: NonceStore;
  /**
   * Set false only in development/testing to skip all on-chain checks.
   * Default: true.
   */
  checkXRPM?: boolean;
  /**
   * Minimum XRPM balance the signing wallet must hold.
   *   - Default: 10 (the standard XRPM token gate).
   *   - 0: wallet-ownership-only — any activated XRPL wallet may sign in.
   *   - Any positive number: custom threshold.
   *
   * Must match the value used in createChallenge({ min_balance }).
   * Has no effect when checkXRPM is false.
   */
  minXrpmBalance?: number;
  /** Override the XRPL RPC endpoint (e.g. for a private node). */
  xrpl?: EligibilityOptions;
}

export interface VerifyLoginResult {
  /** Whether the proof is fully valid and the user is authenticated. */
  valid: boolean;
  /** XRPL wallet address of the authenticated user. */
  address: string;
  /**
   * XRPM balance at time of verification.
   * "unchecked" when minXrpmBalance is 0.
   * "unknown" when checkXRPM is false (dev mode).
   */
  balance: string;
  /** Eligibility details from the on-chain check. */
  eligibility: EligibilityResult;
}

/**
 * Verify a proof received from the XRPM app callback.
 *
 * Performs all verification steps defined in XRPM_LOGIN_V1:
 *   1. Decode proof from base64url JSON
 *   2. Validate schema and version
 *   3. Check aud matches expected
 *   4. Check exp > now (not expired)
 *   5. Check nonce is single-use (replay prevention)
 *   6. Rebuild canonical message
 *   7. SHA256 hash canonical message
 *   8. Verify signature (ed25519 or secp256k1)
 *   9. Derive address from pubkey — must match proof.account
 *  10. Check XRPM balance on XRPL ≥ minXrpmBalance (default 10)
 *      When minXrpmBalance=0: only checks account activation, no balance query.
 *
 * @throws XrpmVerifyError with a typed error code on any failure
 *
 * @example
 * // Standard — 10 XRPM required (default)
 * const result = await verifyLogin(proofBase64url, {
 *   expectedAud: 'https://mysite.com',
 *   expectedRedirectUri: 'https://mysite.com/auth/callback',
 *   nonceStore,
 * });
 *
 * @example
 * // Wallet-ownership-only — no XRPM balance required
 * const result = await verifyLogin(proofBase64url, {
 *   expectedAud: 'https://mysite.com',
 *   expectedRedirectUri: 'https://mysite.com/auth/callback',
 *   nonceStore,
 *   minXrpmBalance: 0,
 * });
 */
export async function verifyLogin(
  proofBase64url: string,
  opts: VerifyLoginOptions,
): Promise<VerifyLoginResult> {
  // Step 1–2: Decode and validate schema
  const proof: Proof = decodeProof(proofBase64url);

  // Step 3: aud must match exactly
  if (proof.aud !== opts.expectedAud) {
    throw new XrpmVerifyError('AUD_MISMATCH', `expected ${opts.expectedAud}, got ${proof.aud}`);
  }

  // Step 4: Expiry enforced server-side
  const now = Math.floor(Date.now() / 1000);
  if (proof.exp <= now) {
    throw new XrpmVerifyError('PROOF_EXPIRED', `expired at ${proof.exp}, now is ${now}`);
  }

  // Step 5: Replay prevention — consume is atomic (returns false if already used)
  const ttl = proof.exp - now;
  const consumed = await opts.nonceStore.consume(proof.nonce, ttl);
  if (!consumed) {
    throw new XrpmVerifyError('NONCE_ALREADY_USED');
  }

  // Step 6–7: Canonical message + SHA256
  const canonical = buildCanonical({
    aud: proof.aud,
    nonce: proof.nonce,
    iat: proof.iat,
    exp: proof.exp,
    client_id: proof.client_id,
  });
  const digest = hashCanonical(canonical);

  // Step 8: Signature verification (throws XrpmVerifyError on failure)
  verifySignature(digest, proof.sig, proof.pubkey, proof.alg);

  // Step 9: Address must match pubkey (throws XrpmVerifyError on failure)
  assertAddressMatchesPubkey(proof.pubkey, proof.account);

  // Step 10: On-chain eligibility check
  // The app-side check is for UX only — always re-verify server-side.
  const shouldCheck = opts.checkXRPM !== false;
  const minBalance   = opts.minXrpmBalance ?? 10;
  let eligibility: EligibilityResult;

  if (shouldCheck) {
    try {
      eligibility = await checkEligibility(proof.account, {
        ...opts.xrpl,
        minXrpmBalance: minBalance,
      });
    } catch (err) {
      throw new XrpmVerifyError('XRPL_UNAVAILABLE', String(err));
    }

    if (!eligibility.activated) {
      throw new XrpmVerifyError('ACCOUNT_NOT_ACTIVATED');
    }
    if (!eligibility.eligible) {
      throw new XrpmVerifyError('INSUFFICIENT_XRPM', `balance: ${eligibility.balance}`);
    }
  } else {
    // Skip all on-chain checks (dev/test only — never use in production)
    eligibility = { eligible: true, activated: true, balance: 'unknown' };
  }

  return {
    valid: true,
    address: proof.account,
    balance: eligibility.balance,
    eligibility,
  };
}
