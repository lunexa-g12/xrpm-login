import * as keypairs from 'ripple-keypairs';
import { XrpmVerifyError } from './errors';

/**
 * Verify that a proof signature is valid.
 *
 * The XRPM app signs SHA256(canonical_message) raw bytes using ed25519 or secp256k1,
 * and returns the signature as base64url-encoded raw bytes.
 *
 * ripple-keypairs expects inputs as uppercase hex strings, so we convert accordingly.
 *
 * @param digestBuffer  - 32-byte SHA256 digest of the canonical message
 * @param sigBase64url  - base64url-encoded raw signature bytes (from proof.sig)
 * @param pubkeyHex     - hex-encoded public key (from proof.pubkey)
 * @param alg           - signing algorithm declared in proof.alg
 * @throws XrpmVerifyError with code ALG_KEY_MISMATCH or INVALID_SIGNATURE
 */
export function verifySignature(
  digestBuffer: Buffer,
  sigBase64url: string,
  pubkeyHex: string,
  alg: 'ed25519' | 'secp256k1',
): void {
  // Guard against algorithm confusion: pubkey prefix must match declared alg
  const prefix = pubkeyHex.toUpperCase().slice(0, 2);
  const expectedPrefix = alg === 'ed25519' ? 'ED' : undefined; // secp256k1 = 02 or 03
  if (alg === 'ed25519' && prefix !== 'ED') {
    throw new XrpmVerifyError('ALG_KEY_MISMATCH', 'ed25519 pubkey must start with ED');
  }
  if (alg === 'secp256k1' && prefix !== '02' && prefix !== '03') {
    throw new XrpmVerifyError('ALG_KEY_MISMATCH', 'secp256k1 pubkey must start with 02 or 03');
  }

  // Convert sig: base64url raw bytes → Buffer → uppercase hex
  const sigBuffer = Buffer.from(sigBase64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const sigHex = sigBuffer.toString('hex').toUpperCase();

  // ripple-keypairs.verify takes uppercase hex for message and signature
  const digestHex = digestBuffer.toString('hex').toUpperCase();

  let valid: boolean;
  try {
    valid = keypairs.verify(digestHex, sigHex, pubkeyHex.toUpperCase());
  } catch {
    throw new XrpmVerifyError('INVALID_SIGNATURE');
  }

  if (!valid) {
    throw new XrpmVerifyError('INVALID_SIGNATURE');
  }
}
