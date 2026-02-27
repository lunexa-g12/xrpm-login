/**
 * POST /api/auth/start
 *
 * Generates a challenge and returns the deep link + challenge_id.
 * The frontend uses this to show a QR code (desktop) or open the XRPM app (mobile).
 *
 * Response: { challenge_id, deep_link, expires_at }
 *   challenge_id — used by the laptop to poll /api/auth/poll for the result
 *                  (cross-device flow: laptop shows QR, phone scans & signs)
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createChallenge } from '@xrpm-login/sdk-web';
import { pendingStore } from '../../../lib/pendingStore';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
const TTL = 300;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { challenge, deepLink } = createChallenge({
    aud: BASE_URL,
    redirect_uri: `${BASE_URL}/api/auth/callback`,
    client_id: new URL(BASE_URL).hostname,
    ttl: TTL,
  });

  // The nonce is already a cryptographically random base64url value — use it as
  // the challenge_id that links the laptop poll to the phone callback.
  const challenge_id = challenge.nonce;
  pendingStore.create(challenge_id, TTL);

  return res.status(200).json({
    challenge_id,
    deep_link: deepLink,
    expires_at: challenge.exp,
  });
}
