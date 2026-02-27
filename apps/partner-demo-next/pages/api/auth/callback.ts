/**
 * GET /api/auth/callback?proof=<base64url>[&state=<state>]
 *
 * The XRPM app redirects here after the user approves sign-in.
 * Verifies the proof and creates a session.
 *
 * Cross-device flow (laptop QR + phone):
 *   After verification, resolves the pending session so the laptop's
 *   /api/auth/poll endpoint can pick up the result.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyLogin, XrpmVerifyError } from '@xrpm-login/sdk-web';
import { nonceStore } from '../../../lib/nonceStore';
import { pendingStore } from '../../../lib/pendingStore';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const proof = req.query['proof'];
  if (typeof proof !== 'string') {
    return res.redirect(`/?error=missing_proof`);
  }

  // Extract nonce (= challenge_id) from the proof BEFORE full verification.
  // This is safe: we only read the nonce field; verifyLogin() validates everything.
  let challengeId: string | undefined;
  try {
    const proofJson = JSON.parse(
      Buffer.from(proof, 'base64url').toString('utf8')
    ) as Record<string, unknown>;
    if (typeof proofJson['nonce'] === 'string') challengeId = proofJson['nonce'];
  } catch { /* malformed proof — verifyLogin will reject it */ }

  try {
    const result = await verifyLogin(proof, {
      expectedAud: BASE_URL,
      expectedRedirectUri: `${BASE_URL}/api/auth/callback`,
      nonceStore,
    });

    // Notify any polling laptop that this challenge_id has been resolved.
    if (challengeId) pendingStore.resolve(challengeId, result.address, result.balance);

    // Session cookie — covers same-device flow and phone-browsing-dashboard.
    // In production: sign a JWT or use iron-session / next-auth.
    res.setHeader('Set-Cookie', [
      `xrpm_address=${result.address}; HttpOnly; Secure; SameSite=Lax; Max-Age=86400; Path=/`,
    ]);

    return res.redirect('/dashboard');
  } catch (err) {
    const code = err instanceof XrpmVerifyError ? err.code : 'UNKNOWN';
    return res.redirect(`/?error=${encodeURIComponent(code)}`);
  }
}
