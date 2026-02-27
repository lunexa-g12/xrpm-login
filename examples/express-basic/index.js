/**
 * Sign In With XRPM — Express basic example
 *
 * Install:
 *   npm install @xrpm-login/sdk-web express express-session
 *
 * Run:
 *   NEXT_PUBLIC_BASE_URL=https://mysite.com node index.js
 *
 * DISCLAIMER: This example is for demonstration only.
 * Read https://github.com/xrpmemes/xrpm-login/blob/main/DISCLAIMER.md
 * before using in production.
 */

const express = require('express');
const session = require('express-session');
const { createChallenge, verifyLogin, XrpmVerifyError, MemoryNonceStore } = require('@xrpm-login/sdk-web');

const app = express();

const BASE_URL = process.env.BASE_URL ?? 'https://mysite.com'; // must be HTTPS
const CALLBACK_URL = `${BASE_URL}/auth/callback`;
const DOMAIN = new URL(BASE_URL).hostname;

// Use RedisNonceStore in production
const nonceStore = new MemoryNonceStore();

app.use(session({
  secret: process.env.SESSION_SECRET ?? 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, httpOnly: true, sameSite: 'lax' },
}));

// ─── Step 1: Generate challenge ──────────────────────────────────────────────

app.post('/auth/start', (req, res) => {
  const { challenge, deepLink } = createChallenge({
    aud: BASE_URL,
    redirect_uri: CALLBACK_URL,
    client_id: DOMAIN,
    ttl: 300,
  });

  // Store nonce to detect replay attacks
  req.session.nonce = challenge.nonce;

  res.json({ deepLink });
});

// ─── Step 2: Verify proof callback from XRPM app ─────────────────────────────

app.get('/auth/callback', async (req, res) => {
  const { proof } = req.query;

  if (typeof proof !== 'string') {
    return res.redirect('/?error=missing_proof');
  }

  try {
    const result = await verifyLogin(proof, {
      expectedAud: BASE_URL,
      expectedRedirectUri: CALLBACK_URL,
      nonceStore,
    });

    // Clear nonce after successful login
    req.session.nonce = null;

    // Create session
    req.session.user = { address: result.address, balance: result.balance };

    return res.redirect('/dashboard');
  } catch (err) {
    const code = err instanceof XrpmVerifyError ? err.code : 'UNKNOWN';
    return res.redirect(`/?error=${encodeURIComponent(code)}`);
  }
});

// ─── Protected route ─────────────────────────────────────────────────────────

app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.json({ message: 'Authenticated', user: req.session.user });
});

app.listen(3000, () => console.log('http://localhost:3000'));
