/**
 * @xrpm-login/verifier
 *
 * Pure cryptographic verification for XRPM_LOGIN_V1 proofs.
 *
 * This package performs NO network calls. It handles:
 *   - Canonical message construction
 *   - SHA256 hashing
 *   - Signature verification (ed25519 + secp256k1)
 *   - Address derivation and cross-check
 *
 * For on-chain balance checks use @xrpm-login/eligibility.
 * For the full end-to-end login flow use @xrpm-login/sdk-web.
 *
 * @see https://github.com/xrpmemes/xrpm-login/spec/XRPM_LOGIN_V1.md
 */

export { buildCanonical, hashCanonical } from './canonical';
export type { CanonicalFields } from './canonical';
export { verifySignature } from './verifySignature';
export { assertAddressMatchesPubkey } from './deriveAddress';
import { XrpmVerifyError } from './errors';
export { XrpmVerifyError };
export type { VerifyErrorCode } from './errors';

/** Proof object as received from the XRPM app via the callback URL. */
export interface Proof {
  v: number;
  aud: string;
  nonce: string;
  iat: number;
  exp: number;
  client_id: string;
  account: string;
  pubkey: string;
  alg: 'ed25519' | 'secp256k1';
  sig: string;
}

/**
 * Decode a base64url-encoded proof string into a Proof object.
 *
 * @throws XrpmVerifyError INVALID_PROOF_ENCODING if decoding fails
 * @throws XrpmVerifyError INVALID_PROOF_SCHEMA if required fields are missing
 * @throws XrpmVerifyError UNSUPPORTED_VERSION if v !== 1
 */
export function decodeProof(proofBase64url: string): Proof {
  let json: string;
  try {
    const padded = proofBase64url.replace(/-/g, '+').replace(/_/g, '/');
    json = Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    throw new XrpmVerifyError('INVALID_PROOF_ENCODING');
  }

  let proof: Partial<Proof>;
  try {
    proof = JSON.parse(json) as Partial<Proof>;
  } catch {
    throw new XrpmVerifyError('INVALID_PROOF_ENCODING', 'proof is not valid JSON');
  }

  const required: (keyof Proof)[] = [
    'v', 'aud', 'nonce', 'iat', 'exp', 'client_id', 'account', 'pubkey', 'alg', 'sig',
  ];
  for (const field of required) {
    if (proof[field] === undefined || proof[field] === null) {
      throw new XrpmVerifyError('INVALID_PROOF_SCHEMA', `missing field: ${field}`);
    }
  }

  if (proof.v !== 1) {
    throw new XrpmVerifyError('UNSUPPORTED_VERSION', `expected v=1, got v=${proof.v}`);
  }

  if (proof.alg !== 'ed25519' && proof.alg !== 'secp256k1') {
    throw new XrpmVerifyError('INVALID_PROOF_SCHEMA', `unknown alg: ${proof.alg}`);
  }

  return proof as Proof;
}
