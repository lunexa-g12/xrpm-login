# @xrpm-login/sdk-web

Node.js SDK for **Sign In With XRPM** — challenge creation and proof verification for partner websites.

## Install

```bash
npm install @xrpm-login/sdk-web
```

## Usage

### 1. Create a challenge (server → frontend)

```js
const { createChallenge } = require('@xrpm-login/sdk-web');

const { challenge, deepLink } = createChallenge({
  aud:          'https://mysite.com',     // your site URL (must be HTTPS)
  redirect_uri: 'https://mysite.com/auth/callback',
  client_id:    'mysite.com',
  ttl:          300,                      // seconds, max 3600
});

// deepLink: open on mobile OR encode as QR on desktop
// challenge.nonce: use as challenge_id for cross-device polling
```

### 2. Verify the proof (server-side, after XRPM app callback)

```js
const { verifyLogin, RedisNonceStore } = require('@xrpm-login/sdk-web');
const Redis = require('ioredis');

const nonceStore = new RedisNonceStore(new Redis());

app.get('/auth/callback', async (req, res) => {
  try {
    const result = await verifyLogin(req.query.proof, {
      expectedAud:         'https://mysite.com',
      expectedRedirectUri: 'https://mysite.com/auth/callback',
      nonceStore,
      checkXRPM: true,   // default — verifies ≥10 XRPM on-chain
    });
    // result.address  — authenticated XRPL wallet address
    // result.balance  — XRPM balance at verification time
    req.session.address = result.address;
    res.redirect('/dashboard');
  } catch (err) {
    // err.code: typed error string (see VerifyErrorCode)
    res.redirect(`/?error=${err.code}`);
  }
});
```

## Nonce Stores

| Store | Import | Use case |
|-------|--------|----------|
| `MemoryNonceStore` | built-in | Development / single-process only |
| `RedisNonceStore` | built-in | Production (recommended) |
| `PostgresNonceStore` | built-in | Production (SQL) |

```js
const { MemoryNonceStore, RedisNonceStore, PostgresNonceStore } = require('@xrpm-login/sdk-web');
```

## Error Codes

`verifyLogin` throws `XrpmVerifyError` with one of these `.code` values:

| Code | Meaning |
|------|---------|
| `INVALID_PROOF_ENCODING` | Not valid base64url JSON |
| `INVALID_PROOF_SCHEMA` | Missing required field |
| `UNSUPPORTED_VERSION` | `v` ≠ 1 |
| `AUD_MISMATCH` | `aud` doesn't match your site |
| `PROOF_EXPIRED` | `exp` is in the past |
| `NONCE_ALREADY_USED` | Replay attack blocked |
| `INVALID_SIGNATURE` | Signature verification failed |
| `ADDRESS_MISMATCH` | `account` doesn't match `pubkey` |
| `ACCOUNT_NOT_ACTIVATED` | XRPL account not funded |
| `INSUFFICIENT_XRPM` | Balance < 10 XRPM |
| `XRPL_UNAVAILABLE` | XRPL RPC error |

## API

### `createChallenge(opts)`

Returns `{ challenge, deepLink }`.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `aud` | `string` | ✅ | Your site's HTTPS URL |
| `redirect_uri` | `string` | ✅ | Where XRPM app redirects after signing |
| `client_id` | `string` | ✅ | Identifier (usually hostname) |
| `ttl` | `number` | — | TTL in seconds (default 300, max 3600) |
| `state` | `string` | — | Opaque value passed through to callback |

### `verifyLogin(proofBase64url, opts)`

Returns `Promise<{ valid, address, balance, eligibility }>`.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `expectedAud` | `string` | ✅ | Must match challenge `aud` |
| `expectedRedirectUri` | `string` | ✅ | Must match challenge `redirect_uri` |
| `nonceStore` | `NonceStore` | ✅ | Replay prevention store |
| `checkXRPM` | `boolean` | — | Set `false` in dev to skip on-chain check |
| `xrpl` | `XrplRpcOptions` | — | Custom XRPL endpoint |

---

MIT License — see [DISCLAIMER](../../DISCLAIMER.md) before integrating.
