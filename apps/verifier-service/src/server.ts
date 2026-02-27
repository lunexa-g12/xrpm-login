/**
 * @xrpm-login/verifier-service
 *
 * Optional hosted REST API for partners who cannot run Node.js.
 * Partners make HTTP requests to this service instead of running the SDK locally.
 *
 * ⚠️  DISCLAIMER
 * This service is provided as a convenience only. Using it introduces a
 * dependency on XRPMEMES infrastructure. For maximum security and uptime
 * independence, run the @xrpm-login/sdk-web package on your own server.
 *
 * Endpoints:
 *   POST /v1/challenge  — generate a challenge
 *   POST /v1/verify     — verify a proof
 *   GET  /v1/eligibility/:address — check XRPM balance
 *   GET  /health
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { createChallenge, verifyLogin, checkEligibility, XrpmVerifyError, MemoryNonceStore, RedisNonceStore } from '@xrpm-login/sdk-web';
import type { Challenge } from '@xrpm-login/sdk-web';
import type { NonceStore } from '@xrpm-login/nonce-store';

const PORT = parseInt(process.env.PORT ?? '3001');

// ─── Store Setup ─────────────────────────────────────────────────────────────

// Challenge store (map challenge_id → challenge object)
const challengeMap = new Map<string, { challenge: Challenge; exp: number }>();

// Nonce store: Redis if configured, memory fallback for dev
let nonceStore: NonceStore;
if (process.env.REDIS_URL) {
  const Redis = require('ioredis');
  const redis = new Redis(process.env.REDIS_URL);
  redis.on('error', (e: Error) => console.error('[redis]', e.message));
  nonceStore = new RedisNonceStore(redis);
  console.log('[store] Redis nonce store');
} else {
  nonceStore = new MemoryNonceStore();
  console.warn('[store] In-memory nonce store — not suitable for production');
}

// ─── App Setup ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// Rate limiting: 60 requests per minute per IP
app.use(rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_MAX ?? '60'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMIT_EXCEEDED' },
}));

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true }));

/**
 * POST /v1/challenge
 * Body: { aud, redirect_uri, client_id, ttl?, state? }
 * Returns: { challenge_id, deep_link, expires_at }
 */
app.post('/v1/challenge', (req: Request, res: Response): void => {
  const { aud, redirect_uri, client_id, ttl, state } = req.body as Record<string, string | number>;

  if (!aud || !redirect_uri || !client_id) {
    res.status(400).json({ error: 'aud, redirect_uri, and client_id are required' });
    return;
  }

  let result;
  try {
    result = createChallenge({
      aud: String(aud),
      redirect_uri: String(redirect_uri),
      client_id: String(client_id),
      ttl: ttl ? Number(ttl) : undefined,
      state: state ? String(state) : undefined,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'invalid_options' });
    return;
  }

  const challenge_id = uuidv4();
  challengeMap.set(challenge_id, { challenge: result.challenge, exp: result.challenge.exp });

  // Lazy clean-up of expired challenges
  const now = Math.floor(Date.now() / 1000);
  for (const [id, entry] of challengeMap) {
    if (entry.exp <= now) challengeMap.delete(id);
  }

  res.json({ challenge_id, deep_link: result.deepLink, expires_at: result.challenge.exp });
});

/**
 * POST /v1/verify
 * Body: { proof, challenge_id, expected_aud, expected_redirect_uri }
 * Returns: { valid, address, balance } or { error }
 */
app.post('/v1/verify', async (req: Request, res: Response): Promise<void> => {
  const { proof, challenge_id, expected_aud, expected_redirect_uri } = req.body as Record<string, string>;

  if (!proof || !challenge_id || !expected_aud || !expected_redirect_uri) {
    res.status(400).json({ error: 'proof, challenge_id, expected_aud, expected_redirect_uri required' });
    return;
  }

  const entry = challengeMap.get(challenge_id);
  if (!entry) {
    res.json({ valid: false, error: 'CHALLENGE_NOT_FOUND_OR_EXPIRED' });
    return;
  }

  // Single use — delete immediately
  challengeMap.delete(challenge_id);

  try {
    const result = await verifyLogin(proof, {
      expectedAud: expected_aud,
      expectedRedirectUri: expected_redirect_uri,
      nonceStore,
    });
    res.json({ valid: true, address: result.address, balance: result.balance });
  } catch (err) {
    const code = err instanceof XrpmVerifyError ? err.code : 'VERIFICATION_FAILED';
    res.json({ valid: false, error: code });
  }
});

/**
 * GET /v1/eligibility/:address
 * Returns: { eligible, activated, balance, reason? }
 */
app.get('/v1/eligibility/:address', async (req: Request, res: Response): Promise<void> => {
  const { address } = req.params;

  if (!address || !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)) {
    res.status(400).json({ error: 'invalid_xrpl_address' });
    return;
  }

  try {
    const result = await checkEligibility(address);
    res.json(result);
  } catch {
    res.status(502).json({ error: 'XRPL_UNAVAILABLE' });
  }
});

app.listen(PORT, () => {
  console.log(`XRPM Login verifier service running on http://localhost:${PORT}`);
  console.log('See DISCLAIMER.md before using in production.');
});
