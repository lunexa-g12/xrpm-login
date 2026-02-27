# Sign In With XRPM — Master Implementation Guide

**Version:** 1.0.0 | **Protocol:** XRPM_LOGIN_V1 | **Date:** 2026-02-26

This document is the single authoritative reference for everyone involved in the
Sign In With XRPM programme:

- **XRPMEMES team** — what to build and deploy on xrpmemes.net
- **XRPM App developers** — how the mobile app handles signing
- **Partner developers** — how to add Sign In With XRPM to any website

---

## Table of Contents

1. [Programme Overview](#1-programme-overview)
2. [How It Works — Full Flow Diagram](#2-how-it-works--full-flow-diagram)
3. [Part A — xrpmemes.net: What to Build and Deploy](#part-a--xrpmemesnet-what-to-build-and-deploy)
   - A1. Hosted API (`api.xrpmemes.net`)
   - A2. Widget CDN (`cdn.xrpmemes.net`)
   - A3. Partner Programme Page
   - A4. Documentation Site
   - A5. Deployment Checklist
4. [Part B — XRPM App: Signing Implementation](#part-b--xrpm-app-signing-implementation)
   - B1. Deep Link Contract
   - B2. Consent Screen
   - B3. Signing Algorithm
   - B4. Redirecting the Proof
   - B5. App-Side Error Codes
5. [Part C — Partner Integration Guide](#part-c--partner-integration-guide)
   - C1. Node.js (Express)
   - C2. Next.js (React)
   - C3. PHP
   - C4. Browser Widget (no build step)
   - C5. Production Checklist
6. [Security Model](#6-security-model)
7. [Disclaimer and Legal](#7-disclaimer-and-legal)
8. [Glossary](#8-glossary)

---

## 1. Programme Overview

Sign In With XRPM lets any website verify that a visitor:

1. **Controls** a specific XRP Ledger wallet (proven by cryptographic signature).
2. **Holds** at least **10 XRPM tokens** on that wallet at the time of login.

No password, no email, no OAuth server. The XRPM mobile app acts as the signing
device. Partner websites verify the cryptographic proof **directly against the XRP
Ledger** — the XRPMEMES infrastructure is optional and is never in the trust path.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Partner Website │     │   XRPM App      │     │   XRP Ledger    │
│  (any tech)      │     │   (phone)        │     │   (blockchain)  │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                         │
         │ 1. Create challenge   │                         │
         │──────────────────────►│                         │
         │                       │ 2. Check balance ──────►│
         │                       │◄──────────────────── ───│
         │                       │ 3. User approves        │
         │                       │    Signs the challenge  │
         │◄──────────────────────│ 4. Return proof         │
         │                       │                         │
         │ 5. Verify proof ───────────────────────────────►│
         │◄───────────────────────────────────────────── ──│
         │ 6. Create session ✅  │                         │
```

**Key properties:**
- XRPMEMES is not in the verification path — no single point of failure.
- Each login produces a cryptographically unique proof that cannot be reused.
- Token balance is verified independently by the partner's server, not taken on trust from the app.

---

## 2. How It Works — Full Flow Diagram

### Same-Device Flow (phone user visits partner site on phone)

```
Phone Browser              XRPM App              Partner Server         XRPL
──────────────             ────────              ──────────────         ────
1. Tap "Sign In"
   POST /auth/start ───────────────────────────► create challenge
                                                 return { deep_link,
                                                          challenge_id }
2. window.location
   = deep_link ──────────►
                           3. Parse challenge
                              Validate aud/exp ──────────────────────► account_info
                                                                       account_lines
                           4. Consent screen
                              (address, domain,
                               XRPM balance)
                           5. User taps Approve
                              Build canonical msg
                              SHA256 → sign
                              Build proof JSON
                              base64url encode
                           6. Redirect browser to
                              redirect_uri?proof=...
7. GET /auth/callback ───────────────────────────► verifyLogin(proof)
                                                    ├─ decode proof
                                                    ├─ check aud/exp
                                                    ├─ consume nonce
                                                    ├─ verify signature
                                                    ├─ derive address
                                                    └─ check XRPM ──────► account_lines
                                                   Set session cookie
                                                   redirect /dashboard
8. /dashboard ✅
```

### Cross-Device Flow (laptop shows QR, user scans with phone)

```
Laptop Browser             Phone Browser         Partner Server         XRPL
──────────────             ─────────────         ──────────────         ────
1. Click "Sign In"
   POST /auth/start ───────────────────────────► create challenge
                                                 pendingStore.create()
                                                 return { deep_link,
                                                          challenge_id }
2. Show QR code
   Start polling
   GET /auth/poll
   ?challenge_id=… ────────────────────────────► { ready: false }
   (every 1.5 s)

                    [user scans QR with phone]
                           3. XRPM app signs
                           4. GET /auth/callback ► verifyLogin(proof)
                                                   pendingStore.resolve()
                              ◄─ redirect /dashboard (phone logs in too)
5. GET /auth/poll ───────────────────────────────► pendingStore.consume()
   ◄─────────────────────────────────────────── ── { ready: true,
                                                     address, balance }
6. QrModal shows ✓
   xrpm:success fires
   window.location = /dashboard
```

---

## Part A — xrpmemes.net: What to Build and Deploy

This section describes every piece of infrastructure the XRPMEMES team needs to
deploy to support the programme.

---

### A1. Hosted API — `api.xrpmemes.net`

The source is at **`apps/verifier-service/`** in this repo.

This is an optional convenience service. Partners who run Node.js or PHP use
their own SDK. Partners using plain HTML/JS, Python, Ruby, or other languages
can call this API instead of running the SDK themselves.

**Deploy target:** Any Node.js 18+ host (Railway, Fly.io, AWS, DigitalOcean, etc.)

#### Environment variables

```env
PORT=3001
REDIS_URL=redis://your-redis:6379      # Required for production
RATE_LIMIT_MAX=60                      # Requests per minute per IP (default 60)
```

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/challenge` | Generate a challenge and deep link |
| `POST` | `/v1/verify` | Verify a proof from the XRPM app |
| `GET`  | `/v1/eligibility/:address` | Check XRPM balance for an address |
| `GET`  | `/health` | Health check |

#### `POST /v1/challenge`

Request:
```json
{
  "aud":          "https://partner.com",
  "redirect_uri": "https://partner.com/auth/callback",
  "client_id":    "partner.com",
  "ttl":          300,
  "state":        "optional-csrf-token"
}
```

Response:
```json
{
  "challenge_id": "uuid-string",
  "deep_link":    "xrpm://signin?req=<base64url>",
  "expires_at":   1700000300
}
```

#### `POST /v1/verify`

Request:
```json
{
  "proof":                  "<base64url proof from callback>",
  "challenge_id":           "uuid-string",
  "expected_aud":           "https://partner.com",
  "expected_redirect_uri":  "https://partner.com/auth/callback"
}
```

Response (success):
```json
{ "valid": true, "address": "rXXX...", "balance": "42.5" }
```

Response (failure):
```json
{ "valid": false, "error": "INVALID_SIGNATURE" }
```

#### `GET /v1/eligibility/:address`

Response:
```json
{
  "eligible": true,
  "activated": true,
  "balance": "42.5"
}
```

#### Deployment steps

```bash
# 1. Clone the repo
git clone https://github.com/xrpmemes/xrpm-login.git
cd xrpm-login

# 2. Install and build
pnpm install
pnpm build

# 3. Configure environment
cp apps/verifier-service/.env.example apps/verifier-service/.env
# Edit .env: set REDIS_URL

# 4. Start
node apps/verifier-service/dist/server.js

# — OR with PM2 —
pm2 start apps/verifier-service/dist/server.js --name xrpm-api
```

> **Security note:** The hosted API is a convenience only. It never holds private
> keys. If this service goes down, partners running the SDK locally are unaffected.

---

### A2. Widget CDN — `cdn.xrpmemes.net`

Partners who want the simplest integration embed a single `<script>` tag:

```html
<script src="https://cdn.xrpmemes.net/xrpm-login/widget.js"></script>
```

The pre-built file is at **`packages/widget/dist/widget.js`** (generated by
`pnpm build`).

#### Hosting steps

1. Build the widget: `pnpm build` (output: `packages/widget/dist/widget.js`).
2. Upload `widget.js` to your CDN or static hosting (S3, Cloudflare R2, etc.).
3. Set the URL as `https://cdn.xrpmemes.net/xrpm-login/widget.js`.
4. Enable CORS header: `Access-Control-Allow-Origin: *`.
5. Set a long cache TTL (e.g. `Cache-Control: public, max-age=86400`).
6. **Versioned paths** (recommended): also serve at
   `https://cdn.xrpmemes.net/xrpm-login/v1.0.0/widget.js` so partners can
   pin a specific version.

#### Subresource Integrity (SRI)

After publishing, compute and publish the SRI hash so security-conscious partners
can pin the script:

```bash
openssl dgst -sha384 -binary packages/widget/dist/widget.js | openssl base64 -A
```

Publish as: `sha384-<hash>` on the documentation page.

---

### A3. Partner Programme Page — `xrpmemes.net/signin`

Create a page on the existing xrpmemes.net website that:

1. **Explains** what Sign In With XRPM is and why users should trust it.
2. **Links** to the documentation and GitHub repo.
3. **Shows** a live demo widget.
4. **Lists** registered partners (optional — builds social proof).
5. **Provides** partner registration / contact form.

#### Suggested page sections

```
┌──────────────────────────────────────────────────────────┐
│  Sign In With XRPM                                        │
│  Verify wallet ownership. Token-gated access. No password.│
│                                                           │
│  [Live demo: Sign In button]                              │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  How it works (3 steps):                                  │
│  1. Partner shows QR  2. User scans  3. Session created   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Quick integration (tabs: Node.js / PHP / HTML widget)    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Trusted by (partner logos)                               │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Become a partner → [GitHub] [Documentation] [Discord]    │
└──────────────────────────────────────────────────────────┘
```

---

### A4. Documentation Site

Host the documentation as part of xrpmemes.net or a subdomain
(`docs.xrpmemes.net`). The content already exists in this repo:

| Source file | Publish as |
|-------------|-----------|
| `README.md` | docs index / overview |
| `spec/XRPM_LOGIN_V1.md` | Protocol specification |
| `DISCLAIMER.md` | Legal / disclaimer |
| `SECURITY.md` | Security / disclosure |
| `packages/sdk-web/README.md` | Node.js SDK reference |
| `packages/widget/README.md` | Widget reference |
| `packages/php/README.md` | PHP reference |
| `packages/verifier/README.md` | Low-level verifier reference |
| This file | Master implementation guide |

---

### A5. xrpmemes.net Deployment Checklist

Before going live, confirm each item:

- [ ] `api.xrpmemes.net` — deployed, health check returns `{ ok: true }`
- [ ] `api.xrpmemes.net` — REDIS_URL set, not using in-memory store
- [ ] `api.xrpmemes.net` — rate limiting active (60 req/min/IP)
- [ ] `api.xrpmemes.net` — HTTPS only, TLS cert valid
- [ ] `cdn.xrpmemes.net/xrpm-login/widget.js` — accessible, CORS header set
- [ ] CDN SRI hash published on docs page
- [ ] Partner programme page live at `xrpmemes.net/signin`
- [ ] Documentation published
- [ ] GitHub repo public at `github.com/xrpmemes/xrpm-login`
- [ ] npm packages published: `@xrpm-login/sdk-web`, `@xrpm-login/verifier`, etc.
- [ ] PHP package published to Packagist: `xrpmemes/xrpm-login`

---

## Part B — XRPM App: Signing Implementation

This section is for the XRPM mobile app development team. It describes exactly
what the app must do when a user taps a Sign In With XRPM deep link.

---

### B1. Deep Link Contract

The app must register and handle the URI scheme:

```
xrpm://signin?req=<base64url_encoded_challenge_json>
```

When this URL is opened (via QR scan, NFC, or direct URL), the app must:

1. Extract the `req` query parameter.
2. Base64url-decode it.
3. Parse as JSON.
4. Proceed to [Consent Screen](#b2-consent-screen).

#### Challenge JSON structure

```json
{
  "v": 1,
  "aud": "https://partner.com",
  "nonce": "KhM737mHR_1AjLuM3JLmboPaL4Fww0-0mDPKzlSCxuA",
  "iat": 1700000000,
  "exp": 1700000300,
  "client_id": "partner.com",
  "redirect_uri": "https://partner.com/auth/callback",
  "state": "optional-opaque-string"
}
```

#### App-side validation (before showing consent screen)

Reject the challenge if any of these fail:

| Check | Rule | Error code |
|-------|------|------------|
| Version | `v === 1` | `UNSUPPORTED_VERSION` |
| Expiry | `exp > Date.now()/1000` | `EXPIRED_CHALLENGE` |
| Audience | `aud` starts with `https://` | `INVALID_AUD` |
| Redirect | `redirect_uri` starts with `https://` and is under `aud` origin | `INVALID_REDIRECT` |
| Nonce format | 43–44 char base64url string | `INVALID_NONCE` |

If any check fails, **do not show the consent screen**. Show an in-app error
message and stop.

---

### B2. Consent Screen

Show the user a clear, unambiguous consent screen **before** signing:

```
┌─────────────────────────────────────────────┐
│                                             │
│   🔐  Sign In With XRPM                    │
│                                             │
│   Requested by:                             │
│   ┌─────────────────────────────────────┐  │
│   │  partner.com                        │  │
│   │  https://partner.com                │  │
│   └─────────────────────────────────────┘  │
│                                             │
│   Your wallet:                              │
│   rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX      │
│                                             │
│   XRPM balance:  ✅  42.5 XRPM             │
│   (Minimum required: 10 XRPM)              │
│                                             │
│   Expires in:  4 min 58 s                  │
│                                             │
│   ⚠️  This will prove you own this wallet.  │
│   Your private key never leaves this app.  │
│                                             │
│   [ Cancel ]            [ Approve ]        │
└─────────────────────────────────────────────┘
```

**Required UI elements:**
- Partner domain (extracted from `aud`) — prominently displayed
- Full `aud` URL — in smaller text
- User's wallet address
- Current XRPM balance with eligible/ineligible indicator
- Time remaining until challenge expires (live countdown)
- Clear statement: "Your private key never leaves this app"
- Cancel and Approve buttons

**Required XRPL checks before showing the screen:**
```
GET account_info  (address)    → check account activated
GET account_lines (address)    → filter by XRPM_CURRENCY, XRPM_ISSUER
                               → show balance, flag if < 10
```

If the account holds less than 10 XRPM, the Approve button should still be
visible but the user should see a warning badge. The partner server will reject
the proof anyway, but the user should understand why.

---

### B3. Signing Algorithm

When the user taps **Approve**, execute these exact steps:

#### Step 1 — Build the canonical message

```
XRPM_LOGIN_V1
aud=<challenge.aud>
nonce=<challenge.nonce>
iat=<challenge.iat>
exp=<challenge.exp>
client_id=<challenge.client_id>
```

Rules:
- Fields are separated by a single newline character (`\n`, ASCII 0x0A).
- **No trailing newline** after `client_id`.
- Values are the exact string values from the challenge JSON.
- The result is a UTF-8 string.

Example:
```
XRPM_LOGIN_V1\naud=https://partner.com\nnonce=KhM737...\niat=1700000000\nexp=1700000300\nclient_id=partner.com
```

#### Step 2 — SHA256 hash

```
bytes  = UTF8(canonical_message)    // raw byte array, not hex
digest = SHA256(bytes)               // 32-byte raw digest
```

Do **not** convert `digest` to hex at this stage.

#### Step 3 — Sign the digest

The private key type determines the algorithm:

| Pubkey prefix | Algorithm | Notes |
|---------------|-----------|-------|
| `ED` | ed25519 | Use `crypto_sign_detached(digest, privateKey)` |
| `02` or `03` | secp256k1 | Use DER-encoded compact signature |

```
sig_bytes   = sign(digest_bytes, private_key)
sig_base64  = base64url(sig_bytes)           // base64url, no padding chars
```

> ⚠️ **Critical:** The signature is over the **raw 32-byte digest**, not the hex
> string. The output is the **raw signature bytes** as base64url, not hex.

#### Step 4 — Build the proof object

```json
{
  "v": 1,
  "aud": "<challenge.aud>",
  "nonce": "<challenge.nonce>",
  "iat": <current_unix_timestamp>,
  "exp": "<challenge.exp>",
  "client_id": "<challenge.client_id>",
  "account": "<wallet_address_rAddress>",
  "pubkey": "<public_key_uppercase_hex>",
  "alg": "ed25519",
  "sig": "<sig_base64>"
}
```

Note: `iat` in the proof is the **signing time**, which may differ slightly from
the challenge `iat`. The verifier does not check `iat` beyond using it in the
canonical message reconstruction.

#### Step 5 — Encode and redirect

```
proof_b64   = base64url(JSON.stringify(proof_object))
redirect_url = challenge.redirect_uri + "?proof=" + proof_b64
```

If `challenge.state` was present:
```
redirect_url += "&state=" + challenge.state
```

Open `redirect_url` in the system browser (or the in-app browser that originally
received the deep link).

---

### B4. Redirecting the Proof

- On **iOS**: use `UIApplication.shared.open(url)` or `SFSafariViewController`.
- On **Android**: use `Intent.ACTION_VIEW` or `CustomTabsIntent`.
- The redirect must happen in the same browser session as the original QR scan
  if possible, so the partner server's session cookie reaches the right browser.

---

### B5. App-Side Error Codes

If the app cannot complete signing, redirect to `redirect_uri` with an error:

```
<redirect_uri>?error=<CODE>[&state=<state>]
```

| Code | When to send |
|------|-------------|
| `USER_REJECTED` | User tapped Cancel |
| `EXPIRED_CHALLENGE` | `exp` passed before user approved |
| `NOT_ELIGIBLE` | Wallet balance < 10 XRPM (partner will also reject, but app can inform user) |
| `INVALID_REDIRECT` | `redirect_uri` failed app validation |

---

## Part C — Partner Integration Guide

This section is for developers adding Sign In With XRPM to their own websites.
Choose the integration path that matches your technology stack.

---

### C1. Node.js (Express) — Full Integration

**Install:**
```bash
npm install @xrpm-login/sdk-web ioredis express express-session
```

**Complete example:**

```js
const express      = require('express');
const session      = require('express-session');
const { createChallenge, verifyLogin, RedisNonceStore } = require('@xrpm-login/sdk-web');
const Redis        = require('ioredis');

const app      = express();
const redis    = new Redis(process.env.REDIS_URL);
const nonceStore = new RedisNonceStore(redis);

// In-memory pending store (cross-device QR flow)
// In production: use Redis for this too
const pending = new Map();

app.use(express.json());
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));

const BASE = process.env.BASE_URL; // e.g. https://mysite.com

// ─── 1. Create challenge ──────────────────────────────────────────────────────

app.post('/auth/start', (req, res) => {
  const { challenge, deepLink } = createChallenge({
    aud:          BASE,
    redirect_uri: `${BASE}/auth/callback`,
    client_id:    new URL(BASE).hostname,
    ttl:          300,
  });

  const challenge_id = challenge.nonce;

  // Reserve slot for cross-device polling
  pending.set(challenge_id, { result: null, exp: challenge.exp });

  res.json({ challenge_id, deep_link: deepLink, expires_at: challenge.exp });
});

// ─── 2. Callback — called by XRPM app on the phone ───────────────────────────

app.get('/auth/callback', async (req, res) => {
  const { proof } = req.query;
  if (!proof) return res.redirect('/?error=missing_proof');

  // Extract challenge_id (nonce) from proof for cross-device linking
  let challengeId;
  try {
    challengeId = JSON.parse(Buffer.from(proof, 'base64url').toString()).nonce;
  } catch {}

  try {
    const result = await verifyLogin(proof, {
      expectedAud:         BASE,
      expectedRedirectUri: `${BASE}/auth/callback`,
      nonceStore,
      checkXRPM: true,         // verify on-chain balance ≥ 10 XRPM
    });

    // Notify polling laptop (cross-device)
    if (challengeId && pending.has(challengeId)) {
      pending.get(challengeId).result = { address: result.address, balance: result.balance };
    }

    req.session.address = result.address;
    req.session.balance = result.balance;
    res.redirect('/dashboard');
  } catch (err) {
    res.redirect(`/?error=${err.code || 'UNKNOWN'}`);
  }
});

// ─── 3. Poll — called by laptop while QR is showing ──────────────────────────

app.get('/auth/poll', (req, res) => {
  const { challenge_id } = req.query;
  const entry = pending.get(challenge_id);

  if (!entry || entry.exp <= Math.floor(Date.now() / 1000)) {
    pending.delete(challenge_id);
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  if (!entry.result) return res.json({ ready: false });

  pending.delete(challenge_id);
  res.json({ ready: true, address: entry.result.address, balance: entry.result.balance });
});

// ─── 4. Protected route ───────────────────────────────────────────────────────

app.get('/dashboard', (req, res) => {
  if (!req.session.address) return res.redirect('/');
  res.send(`<h1>Welcome ${req.session.address}</h1><p>XRPM balance: ${req.session.balance}</p>`);
});

app.listen(3000);
```

---

### C2. Next.js (React) — Full Integration

The demo app in `apps/partner-demo-next/` is the full reference. Below is the
summary of each file.

#### File structure

```
pages/
  index.tsx                  ← Sign-in page (LoginButton + QrModal)
  dashboard.tsx              ← Protected dashboard
  api/
    auth/
      start.ts               ← POST — creates challenge
      callback.ts            ← GET  — verifies proof, resolves pending
      poll.ts                ← GET  — laptop polls for QR result
lib/
  nonceStore.ts              ← Singleton nonce store (swap for Redis in prod)
  pendingStore.ts            ← Cross-device session linking store
next.config.js               ← Security headers
.env.example                 ← Environment variable template
```

#### `pages/index.tsx` — Sign-in page

```tsx
import { LoginButton, QrModal } from '@xrpm-login/ui-react';
import { useState } from 'react';

export default function Home() {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [pollUrl,  setPollUrl]  = useState<string | undefined>();

  return (
    <>
      <LoginButton
        challengeUrl="/api/auth/start"
        onChallengeReady={(link, id) => {
          setDeepLink(link);
          setPollUrl(`/api/auth/poll?challenge_id=${id}`);
        }}
        onError={(e) => console.error(e.message)}
      />
      <QrModal
        deepLink={deepLink}
        pollUrl={pollUrl}
        onClose={() => { setDeepLink(null); setPollUrl(undefined); }}
        title="Sign In With XRPM"
      />
    </>
  );
}
```

#### `pages/api/auth/start.ts`

```ts
import { createChallenge } from '@xrpm-login/sdk-web';
import { pendingStore } from '../../../lib/pendingStore';

export default function handler(req, res) {
  const { challenge, deepLink } = createChallenge({
    aud:          process.env.NEXT_PUBLIC_BASE_URL,
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback`,
    client_id:    new URL(process.env.NEXT_PUBLIC_BASE_URL).hostname,
    ttl: 300,
  });

  pendingStore.create(challenge.nonce, 300);

  res.json({ challenge_id: challenge.nonce, deep_link: deepLink, expires_at: challenge.exp });
}
```

#### `pages/api/auth/callback.ts`

```ts
import { verifyLogin, XrpmVerifyError } from '@xrpm-login/sdk-web';
import { nonceStore } from '../../../lib/nonceStore';
import { pendingStore } from '../../../lib/pendingStore';

export default async function handler(req, res) {
  const { proof } = req.query;

  // Extract nonce for cross-device linking
  let challengeId;
  try {
    challengeId = JSON.parse(Buffer.from(proof, 'base64url').toString()).nonce;
  } catch {}

  try {
    const result = await verifyLogin(proof, {
      expectedAud:         process.env.NEXT_PUBLIC_BASE_URL,
      expectedRedirectUri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback`,
      nonceStore,
    });

    if (challengeId) pendingStore.resolve(challengeId, result.address, result.balance);

    res.setHeader('Set-Cookie', `xrpm_address=${result.address}; HttpOnly; Secure; SameSite=Lax; Max-Age=86400; Path=/`);
    res.redirect('/dashboard');
  } catch (err) {
    res.redirect(`/?error=${err instanceof XrpmVerifyError ? err.code : 'UNKNOWN'}`);
  }
}
```

#### `pages/api/auth/poll.ts`

```ts
import { pendingStore } from '../../../lib/pendingStore';

export default function handler(req, res) {
  const result = pendingStore.consume(req.query.challenge_id);
  if (result === undefined) return res.status(404).json({ error: 'NOT_FOUND' });
  if (result === null)      return res.json({ ready: false });
  res.json({ ready: true, address: result.address, balance: result.balance });
}
```

---

### C3. PHP — Full Integration

**Install:**
```bash
composer require xrpmemes/xrpm-login
```

**Create nonce table (run once):**
```sql
CREATE TABLE xrpm_nonces (
    nonce      VARCHAR(128) NOT NULL PRIMARY KEY,
    expires_at BIGINT NOT NULL
);
CREATE INDEX idx_expires ON xrpm_nonces(expires_at);
```

**auth-start.php:**
```php
<?php
use XrpmLogin\Challenge;

$result      = Challenge::create('https://mysite.com', 'https://mysite.com/auth/callback');
$deepLink    = $result['deepLink'];
$challengeId = $result['challenge']['nonce'];

// Store challenge_id in session for cross-device linking
$_SESSION['challenge_id'] = $challengeId;

// Return JSON for the frontend widget
header('Content-Type: application/json');
echo json_encode([
    'challenge_id' => $challengeId,
    'deep_link'    => $deepLink,
    'expires_at'   => $result['challenge']['exp'],
]);
```

**auth-callback.php:**
```php
<?php
use XrpmLogin\Verifier;
use XrpmLogin\NonceStore\PdoNonceStore;
use XrpmLogin\Exceptions\XrpmVerifyException;

$pdo        = new PDO('mysql:host=localhost;dbname=mysite', $user, $pass);
$nonceStore = new PdoNonceStore($pdo);
$verifier   = new Verifier($nonceStore);

$proof = $_GET['proof'] ?? null;
if (!$proof) {
    header('Location: /?error=missing_proof');
    exit;
}

try {
    $data = $verifier->verify($proof, [
        'expectedAud'         => 'https://mysite.com',
        'expectedRedirectUri' => 'https://mysite.com/auth/callback',
        'checkXRPM'           => true,
    ]);

    $_SESSION['address'] = $data['address'];
    $_SESSION['balance'] = $data['balance'];
    header('Location: /dashboard.php');
} catch (XrpmVerifyException $e) {
    header('Location: /?error=' . urlencode($e->getErrorCode()));
}
```

---

### C4. Browser Widget — No Build Step

For static sites, plain HTML, or any backend language.

#### Minimal setup (uses hosted API on `api.xrpmemes.net`)

```html
<!DOCTYPE html>
<html>
<head><title>My Site</title></head>
<body>

<!-- 1. Load widget -->
<script src="https://cdn.xrpmemes.net/xrpm-login/widget.js"
        integrity="sha384-<SRI_HASH>"
        crossorigin="anonymous"></script>

<!-- 2. Place button -->
<div
  data-xrpm-login
  data-aud="https://mysite.com"
  data-redirect-uri="https://mysite.com/auth/callback"
  data-client-id="mysite.com"
></div>

<!-- 3. Handle result -->
<script>
  const btn = document.querySelector('[data-xrpm-login]');

  btn.addEventListener('xrpm:success', (e) => {
    // e.detail = { address, balance }
    // The XRPM app already redirected to /auth/callback which created the session.
    // Just reload or navigate.
    window.location.href = '/dashboard';
  });

  btn.addEventListener('xrpm:error', (e) => {
    alert('Sign-in failed: ' + e.detail.code);
  });
</script>

</body>
</html>
```

#### Setup using your own backend (recommended for production)

```html
<div
  data-xrpm-login
  data-aud="https://mysite.com"
  data-redirect-uri="https://mysite.com/auth/callback"
  data-client-id="mysite.com"
  data-challenge-url="/auth/start"
  data-poll-url="/auth/poll"
  data-theme="light"
  data-label="Sign In With XRPM"
></div>
```

Your `/auth/start` endpoint must return:
```json
{ "challenge_id": "...", "deep_link": "xrpm://...", "expires_at": 1234567890 }
```

Your `/auth/poll?challenge_id=<id>` endpoint must return:
```json
{ "ready": false }
// or
{ "ready": true, "address": "r...", "balance": "42.5" }
```

#### Widget events reference

| Event | `e.detail` | Description |
|-------|-----------|-------------|
| `xrpm:ready` | `{}` | Widget rendered |
| `xrpm:signin` | `{ challengeId }` | Button clicked, deep link opened |
| `xrpm:success` | `{ address, balance }` | QR scanned and verified |
| `xrpm:error` | `{ code, message }` | Any failure |

---

### C5. Production Checklist for Partners

Before going live, verify all items:

**Security**
- [ ] `HTTPS` is enforced on your site and callback URL
- [ ] `nonceStore` uses Redis or Postgres — not the in-memory store
- [ ] Session cookies use `HttpOnly; Secure; SameSite=Lax`
- [ ] Rate limit your `/auth/start` and `/auth/callback` endpoints
- [ ] `redirect_uri` is hardcoded server-side — not taken from user input

**Verification**
- [ ] `checkXRPM: true` (default) — never skip on-chain balance verification in production
- [ ] `expectedAud` matches your production URL exactly (no trailing slash difference)
- [ ] `expectedRedirectUri` matches the registered callback exactly

**Session management**
- [ ] Session secret is a long random string (≥ 32 bytes), not a default
- [ ] Sessions expire after a reasonable time (e.g. 24 hours)
- [ ] If you require continuous eligibility (gated content), re-check XRPM balance periodically

**Cross-device**
- [ ] `pendingStore` uses Redis or a shared backing store — the in-memory store in the demo does not work with multiple server replicas

**User experience**
- [ ] Show a clear error message if sign-in fails
- [ ] Handle `?error=USER_REJECTED` gracefully (user tapped Cancel)
- [ ] The QR code expires — show the expiry time to the user

---

## 6. Security Model

### Threat summary

| Threat | Mitigation |
|--------|-----------|
| **Replay attack** — reuse a captured proof | Nonce consumed atomically on first use; TTL = challenge `exp` |
| **Cross-site replay** — use proof on different site | `aud` field bound to the challenge; verified by partner server |
| **Forged proof** — fabricate a proof without the key | SHA256 + signature over canonical message; address re-derived from pubkey |
| **Algorithm confusion** — claim ed25519 but use secp256k1 key | pubkey prefix (`ED` vs `02/03`) verified against declared `alg` |
| **Balance manipulation** — user sells tokens after app check | Partner server independently queries XRPL via `account_lines` |
| **Expired proof** — submit a proof after expiry | `exp` checked independently by partner server |
| **Open redirect** — `redirect_uri` points off-domain | SDK enforces same-origin; `redirect_uri` must be under `aud` |
| **Phishing** — fake partner site steals XRPM proof | Proof is bound to `aud`; cannot be used on any other domain |
| **Man-in-the-middle** — intercept the callback | HTTPS enforced on `aud` and `redirect_uri` |
| **DoS on hosted API** | Rate limited at 60 req/min/IP; partners can self-host |

### Trust model

```
Who do you trust?         What they provide
──────────────────────    ──────────────────────────────────────────────
XRP Ledger                Source of truth for balances and addresses
XRPM App                  Signing only — private key never leaves device
Partner Server            Verification logic (runs open-source SDK)
XRPMEMES                  Publishes spec + SDK; not trusted at runtime
```

The XRPMEMES hosted API is NOT required. Partners who run the SDK locally have
zero dependency on XRPMEMES infrastructure after initial setup.

---

## 7. Disclaimer and Legal

The following applies to all parties using this SDK:

1. **Authentication only.** The SDK proves wallet ownership and a point-in-time
   XRPM balance. It does not guarantee current holdings after sign-in.

2. **Partner responsibility.** Partners are solely responsible for their own
   server security, session management, rate limiting, GDPR/privacy compliance,
   and informing users how wallet addresses are used.

3. **No warranty.** The SDK is provided AS IS. XRPMEMES is not liable for
   security breaches, incorrect integrations, or any damages arising from use.

4. **Prohibited uses.** May not be used to phish users, deceive users about
   the requesting domain, or facilitate fraud.

Full text: [DISCLAIMER.md](./DISCLAIMER.md)

By integrating this SDK you accept these terms.

---

## 8. Glossary

| Term | Definition |
|------|-----------|
| **aud** | Audience — the HTTPS URL of the partner website making the auth request |
| **challenge** | A JSON object with a nonce, expiry, and audience, created by the partner server |
| **challenge_id** | Identifier used to link a desktop poll to a phone callback. Equal to the challenge nonce |
| **canonical message** | The exact string the XRPM app signs (XRPM_LOGIN_V1 + fields) |
| **deep link** | The `xrpm://signin?req=...` URL that opens the XRPM app |
| **nonce** | 32 cryptographically random bytes, base64url-encoded; used once for replay prevention |
| **pendingStore** | Server-side store that holds the verification result until the laptop polls for it |
| **nonceStore** | Server-side store that tracks used nonces to prevent replay attacks |
| **proof** | The signed JSON object returned by the XRPM app to the partner's callback URL |
| **redirect_uri** | The HTTPS callback URL on the partner server where the XRPM app sends the proof |
| **rAddress** | An XRPL classic address starting with `r` |
| **SRI** | Subresource Integrity — a hash embedded in the `<script>` tag to verify the widget file |
| **XRPM** | The XRPM token on the XRP Ledger (currency hex: `5852504D...`, issuer: `r9mZNn...`) |
| **XRPL** | XRP Ledger — the public blockchain where XRPM tokens live |

---

*Sign In With XRPM — XRPM_LOGIN_V1 — MIT License*
*GitHub: https://github.com/xrpmemes/xrpm-login*
