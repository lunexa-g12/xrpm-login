import * as keypairs from 'ripple-keypairs';
import { XrpmVerifyError } from './errors';

/**
 * Derive the XRPL classic address (rAddress) from a hex public key,
 * then assert it matches the claimed account in the proof.
 *
 * This prevents an attacker from submitting a proof where:
 *   - pubkey belongs to wallet A
 *   - account claims to be wallet B
 *
 * @throws XrpmVerifyError with code INVALID_PUBKEY or ADDRESS_PUBKEY_MISMATCH
 */
export function assertAddressMatchesPubkey(pubkeyHex: string, claimedAccount: string): void {
  let derived: string;
  try {
    derived = keypairs.deriveAddress(pubkeyHex.toUpperCase());
  } catch {
    throw new XrpmVerifyError('INVALID_PUBKEY', 'unable to derive address from pubkey');
  }

  if (derived !== claimedAccount) {
    throw new XrpmVerifyError(
      'ADDRESS_PUBKEY_MISMATCH',
      'deriveAddress(pubkey) does not equal proof.account',
    );
  }
}
