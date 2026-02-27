# Sign In With XRPM

Open-source authentication SDK that lets any website verify a user holds at least **10 XRPM** tokens on the XRP Ledger — no centralised server required.

> **DISCLAIMER:** This SDK authenticates wallet ownership and performs a point-in-time balance check. It does not guarantee current holdings after login. Read the full [DISCLAIMER.md](./DISCLAIMER.md) before integrating.

---

## How It Works

```
Your Site (Laptop)          XRPM App (Phone)          XRP Ledger
       │                           │                        │
  1.  POST /auth/start             │                        │
       │ ← challenge + deep_link   │                        │
  2.  Show QR code                 │                        │
                    3. Scan QR ───>│                        │
                                   │  sign challenge        │
                                   │──── verify balance ───>│
                                   │<─── confirmed ─────────│
                    4. Redirect to /auth/callback?proof=...
  5.  Verify proof server-side ────────────────────────────>│
       │ ← balance confirmed        │                        │
  6.  Create session                │                        │
```

The XRPM app signs a challenge with the user's XRPL private key. Your server verifies the signature and optionally checks the on-chain XRPM balance — **no XRPMEMES server is in the verification path**.

---

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`@xrpm-login/sdk-web`](./packages/sdk-web) | Node.js SDK — challenge creation + proof verification | `npm i @xrpm-login/sdk-web` |
| [`@xrpm-login/ui-react`](./packages/ui-react) | Drop-in React components | `npm i @xrpm-login/ui-react` |
| [`xrpm-login` (PHP)](./packages/php) | PHP Composer package | `composer require xrpmemes/xrpm-login` |
| [Browser Widget](./packages/widget) | Single `<script>` tag — no build step | CDN or self-hosted |
| [`@xrpm-login/verifier`](./packages/verifier) | Low-level proof verifier (no network calls) | `npm i @xrpm-login/verifier` |
| [`@xrpm-login/eligibility`](./packages/eligibility) | On-chain XRPM balance checker | `npm i @xrpm-login/eligibility` |
| [`@xrpm-login/nonce-store`](./packages/nonce-store) | Replay-prevention nonce stores (Redis, Postgres, Memory) | `npm i @xrpm-login/nonce-store` |

---

## Quick Start — Node.js (Express)

```bash
npm install @xrpm-login/sdk-web
```

```js
const express = require('express');
const { createChallenge, verifyLogin, MemoryNonceStore } = require('@xrpm-login/sdk-web');

const app = express();
const nonceStore = new MemoryNonceStore(); // use RedisNonceStore in production

// 1. Create a challenge
app.post('/auth/start', (req, res) => {
  const { challenge, deepLink } = createChallenge({
    aud:          'https://mysite.com',
    redirect_uri: 'https://mysite.com/auth/callback',
    client_id:    'mysite.com',
  });
  res.json({ deep_link: deepLink, challenge_id: challenge.nonce });
});

// 2. Verify proof from XRPM app
app.get('/auth/callback', async (req, res) => {
  try {
    const result = await verifyLogin(req.query.proof, {
      expectedAud:         'https://mysite.com',
      expectedRedirectUri: 'https://mysite.com/auth/callback',
      nonceStore,
    });
    // result.address — authenticated XRPL wallet
    // result.balance — XRPM balance at login time
    req.session.address = result.address;
    res.redirect('/dashboard');
  } catch (err) {
    res.redirect(`/?error=${err.code}`);
  }
});
```

---

## Quick Start — PHP

```bash
composer require xrpmemes/xrpm-login
```

```php
<?php
use XrpmLogin\Challenge;
use XrpmLogin\Verifier;
use XrpmLogin\NonceStore\PdoNonceStore;
use XrpmLogin\Exceptions\XrpmVerifyException;

$nonceStore = new PdoNonceStore($pdo);
$verifier   = new Verifier($nonceStore);

// 1. Create challenge
$result    = Challenge::create('https://mysite.com', 'https://mysite.com/auth/callback');
$deepLink  = $result['deepLink'];
$challengeId = $result['challenge']['nonce'];

// 2. Verify proof
try {
    $data = $verifier->verify($_GET['proof'], [
        'expectedAud'         => 'https://mysite.com',
        'expectedRedirectUri' => 'https://mysite.com/auth/callback',
    ]);
    $_SESSION['address'] = $data['address'];
    header('Location: /dashboard');
} catch (XrpmVerifyException $e) {
    header('Location: /?error=' . $e->getErrorCode());
}
```

---

## Quick Start — Browser Widget (no build step)

```html
<script src="https://cdn.xrpmemes.net/xrpm-login/widget.js"></script>

<div
  data-xrpm-login
  data-aud="https://mysite.com"
  data-redirect-uri="https://mysite.com/auth/callback"
  data-client-id="mysite.com"
  data-challenge-url="/auth/start"
  data-poll-url="/auth/poll"
></div>

<script>
  document.querySelector('[data-xrpm-login]').addEventListener('xrpm:success', (e) => {
    console.log('Signed in as', e.detail.address);
    window.location.href = '/dashboard';
  });
</script>
```

---

## Quick Start — React

```tsx
import { LoginButton, QrModal } from '@xrpm-login/ui-react';
import { useState } from 'react';

export function SignInPage() {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [pollUrl,  setPollUrl]  = useState<string | undefined>(undefined);

  return (
    <>
      <LoginButton
        challengeUrl="/api/auth/start"
        onChallengeReady={(link, id) => {
          setDeepLink(link);
          setPollUrl(`/api/auth/poll?challenge_id=${id}`);
        }}
      />
      <QrModal
        deepLink={deepLink}
        pollUrl={pollUrl}
        onClose={() => { setDeepLink(null); setPollUrl(undefined); }}
      />
    </>
  );
}
```

---

## Cross-Device Flow (Laptop + Phone)

The widget and React components handle this automatically:

1. Desktop shows a QR code. User scans with their phone.
2. XRPM app signs the challenge and redirects to your `/auth/callback` on the **phone's browser**.
3. Your callback calls `pendingStore.resolve(nonce, address, balance)`.
4. Desktop polls `/auth/poll?challenge_id=<nonce>` every 1.5 s until the result arrives.

See [`apps/partner-demo-next`](./apps/partner-demo-next) for a complete Next.js reference implementation.

---

## Security

- Replay attacks blocked by atomic nonce consumption (Redis / Postgres recommended)
- Algorithm confusion prevented by pubkey prefix check (ED vs 02/03)
- Open-redirect prevented by same-origin `redirect_uri` validation
- On-chain balance re-verified server-side on every login
- Challenge TTL capped at 1 hour; default 5 minutes

See [SECURITY.md](./SECURITY.md) for the full threat model and responsible disclosure policy.

---

## Protocol Specification

Full protocol details: [`spec/XRPM_LOGIN_V1.md`](./spec/XRPM_LOGIN_V1.md)

---

## Development

```bash
# Install
pnpm install

# Build all packages
pnpm build

# Run end-to-end test (no XRPL node required)
node scripts/test-proof.mjs

# Run demo app
cd apps/partner-demo-next && pnpm dev
```

---

## License

MIT — see [LICENSE](./LICENSE).
By using this SDK you accept the [DISCLAIMER](./DISCLAIMER.md).
