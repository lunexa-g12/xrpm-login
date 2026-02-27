/**
 * @xrpm-login/sdk-web
 *
 * "Sign In With XRPM" — high-level SDK for partner websites.
 *
 * ─── IMPORTANT ───────────────────────────────────────────────────────────────
 * By using this SDK you agree to the terms in DISCLAIMER.md.
 * This SDK is for authentication only. Read the disclaimer before integrating.
 * https://github.com/xrpmemes/xrpm-login/blob/main/DISCLAIMER.md
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Quick start:
 *
 *   // 1. Generate a challenge (on your server)
 *   const { challenge, deepLink } = createChallenge({
 *     aud: 'https://mysite.com',
 *     redirect_uri: 'https://mysite.com/auth/callback',
 *     client_id: 'mysite.com',
 *   });
 *   session.nonce = challenge.nonce; // prevent replay attacks
 *
 *   // 2. Show deepLink as QR or button (on your frontend)
 *   //    Use @xrpm-login/ui-react for drop-in React components.
 *
 *   // 3. Verify the proof in your callback route (on your server)
 *   const result = await verifyLogin(req.query.proof, {
 *     expectedAud: 'https://mysite.com',
 *     expectedRedirectUri: 'https://mysite.com/auth/callback',
 *     nonceStore, // use MemoryNonceStore (dev) or RedisNonceStore (prod)
 *   });
 *   // result.address is the authenticated XRPL wallet address
 *
 * @see https://github.com/xrpmemes/xrpm-login
 */

export { createChallenge } from './createChallenge';
export type { ChallengeOptions, Challenge, ChallengeResult } from './createChallenge';

export { verifyLogin } from './verifyLogin';
export type { VerifyLoginOptions, VerifyLoginResult } from './verifyLogin';

export { parseCallback } from './parseCallback';
export type { CallbackParams } from './parseCallback';

export { openXrpmApp, pollForCallback } from './openXrpmApp';

// Re-export typed errors so partners can catch by type
export { XrpmVerifyError } from '@xrpm-login/verifier';
export type { VerifyErrorCode } from '@xrpm-login/verifier';

// Re-export nonce store adapters for convenience
export { MemoryNonceStore, RedisNonceStore, PostgresNonceStore } from '@xrpm-login/nonce-store';
export type { NonceStore } from '@xrpm-login/nonce-store';

// Re-export eligibility checker for standalone use
export { checkEligibility } from '@xrpm-login/eligibility';
export type { EligibilityResult } from '@xrpm-login/eligibility';
