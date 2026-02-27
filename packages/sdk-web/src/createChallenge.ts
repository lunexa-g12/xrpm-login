import crypto from 'crypto';

const DEFAULT_MIN_BALANCE = 10;

export interface ChallengeOptions {
  /** Full HTTPS URL of your site. Bound to the proof — must match on verification. */
  aud: string;
  /** HTTPS callback URL where the XRPM app will send the proof. Must be under aud origin. */
  redirect_uri: string;
  /** Your app identifier (typically your domain, e.g. "mysite.com"). */
  client_id: string;
  /** Challenge lifetime in seconds. Default: 300. Max: 3600. */
  ttl?: number;
  /** Optional opaque CSRF token echoed back in the callback. */
  state?: string;
  /**
   * Minimum XRPM balance the signing wallet must hold.
   *   - Default: 10  — the standard XRPM token gate.
   *   - 0           — wallet-ownership-only mode; any activated XRPL wallet
   *                   may sign in regardless of XRPM balance.
   *   - Any positive number — custom threshold (e.g. 50, 100).
   *
   * This value is embedded in the challenge so the XRPM app can display the
   * correct threshold on its consent screen. The partner server enforces the
   * same value independently via verifyLogin({ minXrpmBalance }).
   */
  min_balance?: number;
}

export interface Challenge {
  v: 1;
  aud: string;
  nonce: string;
  iat: number;
  exp: number;
  client_id: string;
  redirect_uri: string;
  state?: string;
  /**
   * Minimum XRPM balance required (partner-configurable).
   * Omitted when equal to the default (10) to keep the challenge compact.
   * The XRPM app treats a missing field as 10.
   */
  min_balance?: number;
}

export interface ChallengeResult {
  /** Structured challenge object. Store challenge.nonce to prevent replay attacks. */
  challenge: Challenge;
  /**
   * Deep link URI to pass to the XRPM mobile app.
   * On mobile: open this URL directly.
   * On desktop: encode as a QR code.
   */
  deepLink: string;
}

const MAX_TTL = 3600;

/**
 * Generate a new sign-in challenge.
 *
 * @throws TypeError if aud or redirect_uri are not HTTPS URLs
 * @throws TypeError if redirect_uri is not on the same origin as aud
 * @throws TypeError if min_balance is negative
 *
 * @example
 * // Standard — requires 10 XRPM
 * const { challenge, deepLink } = createChallenge({
 *   aud: 'https://mysite.com',
 *   redirect_uri: 'https://mysite.com/auth/callback',
 *   client_id: 'mysite.com',
 * });
 *
 * @example
 * // Wallet-ownership-only — no XRPM balance required
 * const { challenge, deepLink } = createChallenge({
 *   aud: 'https://mysite.com',
 *   redirect_uri: 'https://mysite.com/auth/callback',
 *   client_id: 'mysite.com',
 *   min_balance: 0,
 * });
 */
export function createChallenge(opts: ChallengeOptions): ChallengeResult {
  // Security: both URLs must be HTTPS
  if (!opts.aud.startsWith('https://')) {
    throw new TypeError('aud must be an HTTPS URL');
  }
  if (!opts.redirect_uri.startsWith('https://')) {
    throw new TypeError('redirect_uri must be an HTTPS URL');
  }

  // Security: redirect_uri must belong to the same origin as aud
  // This prevents open redirect attacks where an attacker sets redirect_uri to their domain
  const audOrigin = new URL(opts.aud).origin;
  const redirectOrigin = new URL(opts.redirect_uri).origin;
  if (audOrigin !== redirectOrigin) {
    throw new TypeError('redirect_uri must be on the same origin as aud');
  }

  const minBalance = opts.min_balance ?? DEFAULT_MIN_BALANCE;
  if (minBalance < 0) {
    throw new TypeError('min_balance cannot be negative');
  }

  const ttl = Math.min(opts.ttl ?? 300, MAX_TTL);
  const now = Math.floor(Date.now() / 1000);

  // Nonce: base64url of 32 random bytes (per spec)
  const nonce = crypto.randomBytes(32).toString('base64url');

  const challenge: Challenge = {
    v: 1,
    aud: opts.aud,
    nonce,
    iat: now,
    exp: now + ttl,
    client_id: opts.client_id,
    redirect_uri: opts.redirect_uri,
    ...(opts.state !== undefined && { state: opts.state }),
    // Only include min_balance when it differs from the default to keep
    // the challenge compact. The XRPM app treats a missing field as 10.
    ...(minBalance !== DEFAULT_MIN_BALANCE && { min_balance: minBalance }),
  };

  const encoded = Buffer.from(JSON.stringify(challenge))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const deepLink = `xrpm://signin?req=${encoded}`;

  return { challenge, deepLink };
}
