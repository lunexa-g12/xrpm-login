# Sign In With XRPM — Browser Widget

Drop-in JavaScript widget. Add a single `<script>` tag — no build step, no framework required.

## Usage

```html
<!-- 1. Load the widget script -->
<script src="https://cdn.xrpmemes.net/xrpm-login/widget.js"></script>

<!-- 2. Place the container div anywhere on your page -->
<div
  data-xrpm-login
  data-aud="https://mysite.com"
  data-redirect-uri="https://mysite.com/auth/callback"
  data-client-id="mysite.com"
  data-challenge-url="/auth/start"
  data-poll-url="/auth/poll"
></div>

<!-- 3. Listen for events -->
<script>
  const el = document.querySelector('[data-xrpm-login]');
  el.addEventListener('xrpm:success', (e) => {
    console.log('Signed in as', e.detail.address, 'balance:', e.detail.balance);
    window.location.href = '/dashboard';
  });
  el.addEventListener('xrpm:error', (e) => {
    console.error('Sign-in failed:', e.detail.code, e.detail.message);
  });
</script>
```

## Configuration (data-* attributes)

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-aud` | ✅ | Your site URL (must be `https://`) |
| `data-redirect-uri` | ✅ | Where XRPM app redirects after signing |
| `data-client-id` | — | Identifier (defaults to hostname of `data-aud`) |
| `data-challenge-url` | — | POST endpoint for challenge creation. Default: hosted API |
| `data-poll-url` | — | GET endpoint for cross-device polling (see below) |
| `data-api` | — | Base URL for hosted API (default: `https://api.xrpmemes.net`) |
| `data-label` | — | Button text (default: `Sign In With XRPM`) |
| `data-theme` | — | `light` (default) or `dark` |
| `data-ttl` | — | Challenge TTL in seconds (default: 300) |

## Events

All events fire on the container element with `bubbles: true`.

| Event | Detail | When |
|-------|--------|------|
| `xrpm:ready` | `{}` | Widget initialised |
| `xrpm:signin` | `{ challengeId }` | User clicked button, deep link opened |
| `xrpm:success` | `{ address, balance }` | Sign-in complete |
| `xrpm:error` | `{ code, message }` | Any failure |

## Mobile vs Desktop

- **Mobile**: the widget opens the XRPM deep link directly (`window.location.href`). The XRPM app signs the challenge and redirects back to `data-redirect-uri`. Your server sets a session cookie and redirects to the dashboard.

- **Desktop**: the widget shows a QR code in a modal. The user scans with their phone. Your server stores the result keyed by `challenge_id`. The widget polls `data-poll-url?challenge_id=<id>` every 1.5 s. When `{ ready: true }` is returned it fires `xrpm:success`.

## Server endpoints required

### `data-challenge-url` — POST

Request body: `{ aud, redirect_uri, client_id, ttl }`

Expected response:
```json
{ "challenge_id": "...", "deep_link": "xrpm://...", "expires_at": 1234567890 }
```

### `data-poll-url` — GET `?challenge_id=<id>`

Expected responses:
```json
{ "ready": false }                            // still waiting
{ "ready": true, "address": "r...", "balance": "42.5" }  // done
```

See [`apps/partner-demo-next`](../../apps/partner-demo-next) for a complete Next.js reference implementation.

---

## Build from source

```bash
pnpm install
node packages/widget/build.js
# → packages/widget/dist/widget.js
```

MIT License — see [DISCLAIMER](../../DISCLAIMER.md).
