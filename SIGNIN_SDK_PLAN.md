# Sign In With XRPM — Partner SDK
## Build Plan & Technical Specification

---

## 1. What Is This?

"Sign In With XRPM" is a cryptographic authentication protocol that lets any website
allow users to log in by proving ownership of an XRPL wallet that holds at least 10 XRPM
tokens. No passwords, no OAuth, no email — just a wallet signature.

It works similarly to "Sign In With Ethereum" (EIP-4361) but built for the XRP Ledger
and gated by XRPM token ownership.

---

## 2. How the Protocol Works (End to End)

```
Partner Website                    XRPM Mobile App              XRPL Network
──────────────                     ────────────────             ────────────
1. Generate challenge
   { aud, nonce, exp,
     client_id, state }
   → base64url encode
   → build deep link:
     xrpm://signin?req=<b64>

2. Show QR code or
   "Open in XRPM" button ──────→  3. App receives deep link
                                      Parse & validate challenge
                                      Check exp (not expired)
                                      Check aud (valid URL)
                                                              ←── 4. Check XRPM balance
                                                                   (must be ≥ 10 XRPM)
                                   5. Show consent screen
                                      - Domain requesting
                                      - Wallet address
                                      - XRPM eligibility badge
                                      - Expiry countdown

                                   6. User approves (biometric/PIN)
                                      Build canonical message:
                                        XRPM_LOGIN_V1
                                        aud=<aud>
                                        nonce=<nonce>
                                        iat=<now>
                                        exp=<exp>
                                        client_id=<client_id>
                                      SHA256(canonical) → hex
                                      ripple-keypairs.sign(hex, privateKey)
                                      Build proof object
                                      base64url encode

7. Receive callback  ←──────────  8. Redirect to:
   aud?proof=<b64>                   <aud>?proof=<b64>[&state=<s>]
   [&state=<state>]

9. Decode proof
10. Verify signature
    (ripple-keypairs)
11. Verify XRPM balance          ──────────────────────────────→ Check balance
12. Session created ✅
```

---

## 3. The Proof Object (What the Website Receives)

```json
{
  "v": 1,
  "aud": "https://partner-site.com/callback",
  "nonce": "abc123xyz",
  "iat": 1700000100,
  "exp": 1700000400,
  "client_id": "partner-site.com",
  "account": "rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "pubkey": "ED1234...ABCD",
  "alg": "ed25519",
  "sig": "AABBCC...FFEE"
}
```

**Verification steps the partner must perform:**
1. Decode base64url → JSON
2. Check `aud` matches their own callback URL (prevents replay across sites)
3. Check `exp` > now (not expired)
4. Check `nonce` has not been seen before (prevents replay)
5. Reconstruct canonical message and SHA256 hash
6. Verify `sig` against `pubkey` using ripple-keypairs
7. Confirm `account` matches `pubkey` (address derivation check)
8. Check XRPM balance on XRPL ≥ 10 (optional but recommended)

---

## 4. XRPM Constants (Required for Verification)

```
Currency (hex): 5852504D00000000000000000000000000000000
Issuer address: r9mZNnos1GLtc55tkmr21G9BgXxV7w9hT1
Minimum balance: 10 XRPM
XRPL HTTP endpoint: https://xrplcluster.com
```

Balance check via XRPL HTTP JSON-RPC:
```json
POST https://xrplcluster.com
{
  "method": "account_lines",
  "params": [{
    "account": "<wallet_address>",
    "peer": "r9mZNnos1GLtc55tkmr21G9BgXxV7w9hT1"
  }]
}
```
Filter lines where `currency === "5852504D00000000000000000000000000000000"`,
check `parseFloat(line.balance) >= 10`.

---

## 5. Deliverables

### 5A. Node.js / npm Package — `@xrpmemes/signin`

Target: Next.js, Express, Fastify, Nuxt, any Node backend.

**Install:**
```bash
npm install @xrpmemes/signin
```

**API surface:**
```js
import { createChallenge, verifyProof, checkEligibility } from '@xrpmemes/signin';

// 1. Generate a challenge + deep link
const { challenge, deepLink, qrData } = createChallenge({
  aud: 'https://mysite.com/auth/callback',
  client_id: 'mysite.com',
  ttl: 300,          // seconds until expiry (default: 300)
  state: 'xyz',      // optional, returned in callback
});
// Store challenge.nonce in session to prevent replay

// 2. Verify the proof received in the callback
const result = await verifyProof(proofBase64url, {
  expectedAud: 'https://mysite.com/auth/callback',
  expectedClientId: 'mysite.com',
  usedNonces: myNonceStore,   // Set or store to prevent replay
  checkXRPM: true,            // default true — checks on-chain balance
});
// result: { valid, address, pubkey, balance, error? }

// 3. Optional standalone balance check
const { eligible, balance } = await checkEligibility('rXXXX...');
```

**Express middleware example:**
```js
import { xrpmSignin } from '@xrpmemes/signin/express';

app.get('/auth/signin', (req, res) => {
  const { challenge, deepLink } = createChallenge({ aud: CALLBACK_URL, client_id: DOMAIN });
  req.session.nonce = challenge.nonce;
  res.json({ deepLink });
});

app.get('/auth/callback', xrpmSignin({
  aud: CALLBACK_URL,
  client_id: DOMAIN,
  getNonce: (req) => req.session.nonce,
  onSuccess: (req, res, { address, balance }) => {
    req.session.user = { address };
    res.redirect('/dashboard');
  },
  onFailure: (req, res, error) => {
    res.redirect('/login?error=' + error);
  },
}));
```

**Next.js App Router example:**
```js
// app/api/auth/callback/route.js
import { verifyProof } from '@xrpmemes/signin';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const proof = searchParams.get('proof');
  const result = await verifyProof(proof, { expectedAud: CALLBACK_URL });
  if (result.valid) {
    // create session / JWT
  }
}
```

---

### 5B. PHP Composer Package — `xrpmemes/signin-php`

Target: Laravel, WordPress, plain PHP.

**Install:**
```bash
composer require xrpmemes/signin-php
```

**API surface:**
```php
use XRPMemes\Signin\Challenge;
use XRPMemes\Signin\Verifier;

// Generate challenge
$challenge = Challenge::create([
  'aud' => 'https://mysite.com/callback',
  'client_id' => 'mysite.com',
  'ttl' => 300,
]);
$_SESSION['nonce'] = $challenge->nonce;
$deepLink = $challenge->deepLink();

// Verify proof
$verifier = new Verifier([
  'aud' => 'https://mysite.com/callback',
  'client_id' => 'mysite.com',
]);
$result = $verifier->verify($_GET['proof'], $_SESSION['nonce']);
if ($result->valid) {
  $_SESSION['user'] = $result->address;
}
```

---

### 5C. Hosted Verification REST API

Target: Any language (Python, Ruby, Java, Go) or no-backend use cases.
Hosted by XRPMEMES — partners need no SDK at all.

**Base URL:** `https://api.xrpmemes.net/signin/v1`

**Endpoints:**

```
POST /challenge
Body: { aud, client_id, ttl?, state? }
Returns: { challenge_id, req (base64url), deep_link, expires_at }

POST /verify
Body: { proof (base64url), challenge_id, expected_aud }
Returns: { valid, address, pubkey, balance, error? }

GET /eligibility/:address
Returns: { eligible, balance, reason? }
```

Partners store the `challenge_id` server-side, pass it with the verify call.
No crypto library needed on the partner side.

---

### 5D. Drop-in Browser Widget

Target: Simple sites, landing pages, forums. Zero backend needed for basic use.

```html
<script src="https://cdn.xrpmemes.net/signin/widget.js"></script>

<div
  id="xrpm-signin"
  data-aud="https://mysite.com/callback"
  data-client-id="mysite.com"
></div>
```

Renders a styled "Sign In With XRPM" button. On click:
- Calls hosted API to create challenge
- Shows QR code (for desktop) or opens deep link directly (on mobile)
- Polls for result or receives via callback URL
- Fires `xrpm:signin` DOM event with `{ address, balance }` on success

---

## 6. Repository Structure

```
signin-sdk/                          ← new repo (separate from xrpm app)
├── packages/
│   ├── core/                        ← shared logic (TS)
│   │   ├── src/
│   │   │   ├── challenge.ts         ← createChallenge()
│   │   │   ├── verify.ts            ← verifyProof()
│   │   │   ├── eligibility.ts       ← checkEligibility() via XRPL RPC
│   │   │   ├── crypto.ts            ← SHA256, ripple-keypairs wrapper
│   │   │   └── constants.ts         ← XRPM currency hex, issuer, XRPL endpoint
│   │   └── package.json
│   ├── node/                        ← @xrpmemes/signin (npm)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── express.ts           ← Express middleware
│   │   └── package.json
│   ├── php/                         ← xrpmemes/signin-php (Composer)
│   │   ├── src/
│   │   │   ├── Challenge.php
│   │   │   ├── Verifier.php
│   │   │   └── XRPLClient.php
│   │   └── composer.json
│   └── widget/                      ← browser widget (vanilla JS bundle)
│       ├── src/
│       │   ├── widget.ts
│       │   └── ui.ts
│       └── package.json
├── server/                          ← hosted REST API (Express/Node)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── challenge.ts
│   │   │   ├── verify.ts
│   │   │   └── eligibility.ts
│   │   ├── store/                   ← nonce/challenge store (Redis)
│   │   └── index.ts
│   └── package.json
├── examples/
│   ├── express/
│   ├── nextjs/
│   ├── php-laravel/
│   └── html-widget/
├── docs/
│   ├── integration-guide.md
│   ├── security.md
│   └── api-reference.md
└── package.json                     ← monorepo root (pnpm workspaces)
```

---

## 7. Core Dependencies

| Package | Purpose |
|---|---|
| `ripple-keypairs` | Verify XRPL ed25519 / secp256k1 signatures |
| `ripple-address-codec` | Derive classic address from public key (for address ↔ pubkey check) |
| Node `crypto` (built-in) | SHA256 hashing |
| `ioredis` (server only) | Nonce store to prevent replay attacks |

PHP equivalents:
| Package | Purpose |
|---|---|
| `simplito/elliptic-php` | Curve verification |
| `symfony/http-client` | XRPL RPC calls |

---

## 8. Security Requirements

- **Nonce replay prevention**: every nonce must be stored and rejected if seen again (TTL = challenge exp)
- **`aud` must match exactly**: prevents stolen proofs being used on other sites
- **Expiry enforced server-side**: `exp` checked at verification time, not just in the app
- **XRPM balance re-checked server-side**: app-side check is UX only; server must re-verify
- **HTTPS only** for all `aud` values (enforced in `createChallenge`)
- **Rate limiting** on the hosted API per IP and per `client_id`

---

## 9. Suggested Build Order

| Step | Deliverable | Why first |
|---|---|---|
| 1 | `packages/core` (TypeScript) | All other packages depend on this |
| 2 | `packages/node` + Express middleware | Most likely partner stack; needed for examples |
| 3 | `server/` (hosted REST API) | Unblocks non-Node partners immediately |
| 4 | `packages/widget` | Low friction for simple sites |
| 5 | `packages/php` | Needed for WordPress/Laravel partners |

---

## 10. Signing Protocol Reference (XRPM_LOGIN_V1)

This is what the mobile app signs and what the SDK must verify.

**Canonical message format (exact, newline-separated):**
```
XRPM_LOGIN_V1
aud=<aud>
nonce=<nonce>
iat=<iat>
exp=<exp>
client_id=<client_id>
```

**Signing (done in the mobile app):**
```
hash   = SHA256(canonical).toUpperCase()        // hex string, uppercase
sig    = ripple-keypairs.sign(hash, privateKey)  // signs raw bytes, no internal hash
alg    = privateKey.startsWith('ED') ? 'ed25519' : 'ecdsa-secp256k1'
```

**Verification (done in the SDK):**
```
hash        = SHA256(canonical).toUpperCase()
isValid     = ripple-keypairs.verify(hash, proof.sig, proof.pubkey)
addrMatches = ripple-address-codec.deriveAddress(proof.pubkey) === proof.account
```

Both `isValid` AND `addrMatches` must be true.

---

## 11. Test Challenge Generator

To test without the mobile app, generate a valid challenge:

```js
const crypto = require('crypto');

const nowSec = () => Math.floor(Date.now() / 1000);
const toBase64Url = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

const challenge = {
  aud: 'https://mysite.com/callback',
  nonce: crypto.randomBytes(16).toString('hex'),
  exp: nowSec() + 300,
  client_id: 'mysite.com',
  state: 'optional_state',
};

const deepLink = `xrpm://signin?req=${toBase64Url(challenge)}`;
console.log(deepLink);

// iOS simulator:
// xcrun simctl openurl booted "<deepLink>"
```

---

*Document created: 2026-02-26*
*App version at time of writing: v3.1.0 b1*
*Protocol version: XRPM_LOGIN_V1*
