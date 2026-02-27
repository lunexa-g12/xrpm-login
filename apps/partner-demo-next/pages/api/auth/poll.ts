/**
 * GET /api/auth/poll?challenge_id=<id>
 *
 * Laptop-side polling endpoint for the cross-device (QR) flow.
 *
 * Returns:
 *   { ready: false }                          — still waiting for the phone
 *   { ready: true, address, balance }         — phone verified, result ready
 *   404 { error: 'NOT_FOUND' }                — unknown or expired challenge_id
 *
 * The challenge_id is the nonce returned by /api/auth/start.
 * The phone's /api/auth/callback calls pendingStore.resolve() which unblocks this.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { pendingStore } from '../../../lib/pendingStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { challenge_id } = req.query;
  if (typeof challenge_id !== 'string' || !challenge_id) {
    return res.status(400).json({ error: 'challenge_id required' });
  }

  const result = pendingStore.consume(challenge_id);

  if (result === undefined) {
    // Not found or expired — stop polling
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  if (result === null) {
    // Still waiting for the phone to complete sign-in
    return res.status(200).json({ ready: false });
  }

  // Resolved — return the verified address and balance
  return res.status(200).json({ ready: true, address: result.address, balance: result.balance });
}
