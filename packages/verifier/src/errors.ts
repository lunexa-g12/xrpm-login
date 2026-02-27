/**
 * Typed error codes returned by verifyProof().
 *
 * Using typed errors instead of raw strings prevents callers from
 * accidentally branching on a misspelled string.
 */

export type VerifyErrorCode =
  | 'INVALID_PROOF_ENCODING'   // proof is not valid base64url JSON
  | 'INVALID_PROOF_SCHEMA'     // proof is missing required fields
  | 'UNSUPPORTED_VERSION'      // proof.v !== 1
  | 'AUD_MISMATCH'             // proof.aud !== expected
  | 'CLIENT_ID_MISMATCH'       // proof.client_id !== expected
  | 'PROOF_EXPIRED'            // proof.exp <= now
  | 'NONCE_ALREADY_USED'       // replay attack detected
  | 'INVALID_SIGNATURE'        // signature verification failed
  | 'ADDRESS_PUBKEY_MISMATCH'  // deriveAddress(pubkey) !== account
  | 'INVALID_PUBKEY'           // pubkey is malformed
  | 'ALG_KEY_MISMATCH'         // alg field doesn't match pubkey prefix
  | 'INSUFFICIENT_XRPM'        // on-chain balance < 10 XRPM
  | 'ACCOUNT_NOT_ACTIVATED'    // XRPL account does not exist
  | 'XRPL_UNAVAILABLE';        // XRPL RPC call failed

export class XrpmVerifyError extends Error {
  readonly code: VerifyErrorCode;

  constructor(code: VerifyErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'XrpmVerifyError';
    this.code = code;
  }
}
