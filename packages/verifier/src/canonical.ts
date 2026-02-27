import crypto from 'crypto';

export interface CanonicalFields {
  aud: string;
  nonce: string;
  iat: number;
  exp: number;
  client_id: string;
}

/**
 * Build the canonical message that the XRPM app signs.
 *
 * Format is exact per XRPM_LOGIN_V1 spec — newline-separated, no trailing newline.
 *
 * @example
 * buildCanonical({ aud: 'https://x.com', nonce: 'abc', iat: 1, exp: 2, client_id: 'x.com' })
 * // "XRPM_LOGIN_V1\naud=https://x.com\nnonce=abc\niat=1\nexp=2\nclient_id=x.com"
 */
export function buildCanonical(fields: CanonicalFields): string {
  return [
    'XRPM_LOGIN_V1',
    `aud=${fields.aud}`,
    `nonce=${fields.nonce}`,
    `iat=${fields.iat}`,
    `exp=${fields.exp}`,
    `client_id=${fields.client_id}`,
  ].join('\n');
}

/**
 * SHA256 hash the canonical message.
 * Returns the raw 32-byte digest as a Buffer.
 *
 * The signing spec says: sign the raw digest bytes (not the hex string).
 */
export function hashCanonical(canonical: string): Buffer {
  return crypto.createHash('sha256').update(canonical, 'utf8').digest();
}
