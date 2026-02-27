# XRPM Sign-In — Repository Blueprint
**Version 2 · 2026-02-26**

This document describes the complete layout and purpose of every package, app, and file in the `xrpm-login` monorepo. Use it as the authoritative map when building, extending, or debugging the system.

---

## 1. Monorepo Overview

```
xrpm-login/
├── README.md                          Root readme — integration overview
├── LICENSE                            MIT
├── SECURITY.md                        Vulnerability disclosure policy
├── CONTRIBUTING.md                    How to contribute
├── DISCLAIMER.md                      Liability disclaimer for partners
├── MASTER_IMPLEMENTATION_GUIDE.md     Full step-by-step guide for all actors
├── package.json                       Root package (private, no publish)
├── pnpm-workspace.yaml                Declares packages/* and apps/* workspaces
├── tsconfig.base.json                 Shared TypeScript config inherited by all packages
├── spec/                              Protocol specification (source of truth)
├── packages/                          Publishable npm packages
├── apps/                              Non-published applications
└── scripts/                           Dev and test utilities
```

### Toolchain

| Tool | Purpose |
|---|---|
| pnpm workspaces | Monorepo package manager |
| TypeScript 5.x | All source code |
| esbuild | Widget bundle only |
| ts-node-dev | Development server for apps |
| Node ≥ 18 | Runtime requirement |

Build command from root:
```bash
pnpm build          # builds all packages in dependency order
```

Test command from root:
```bash
node scripts/test-proof.mjs   # full end-to-end proof test (no network)
```

---

## 2. Protocol Specification — `spec/`

```
spec/
├── XRPM_LOGIN_V1.md          Full protocol specification (canonical reference)
├── threat-model.md           Threat model — 10 attack scenarios with mitigations
├── proof.schema.json         JSON Schema for the proof object
└── challenge.schema.json     JSON Schema for the challenge object
```

**`XRPM_LOGIN_V1.md`** is the governing document. If any code contradicts the spec, the spec wins and the code must be fixed.

**Key protocol constants defined in the spec:**

| Constant | Value |
|---|---|
| Protocol version | `1` |
| Canonical message header | `XRPM_LOGIN_V1` |
| XRPM currency hex | `5852504D00000000000000000000000000000000` |
| XRPM issuer | `r9mZNnos1GLtc55tkmr21G9BgXxV7w9hT1` |
| Default min XRPM balance | `10` |
| Default challenge TTL | `300` seconds |
| Max challenge TTL | `3600` seconds |
| XRPL endpoint | `https://xrplcluster.com` |

---

## 3. Package: `@xrpm-login/verifier`

**Path:** `packages/verifier/`
**npm:** `@xrpm-login/verifier`
**Purpose:** Pure cryptographic verification. No network calls. No side effects.

```
packages/verifier/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts            Public API + Proof interface + decodeProof()
    ├── canonical.ts        buildCanonical() + hashCanonical()
    ├── verifySignature.ts  verifySignature() — ed25519 + secp256k1
    ├── deriveAddress.ts    assertAddressMatchesPubkey()
    └── errors.ts           XrpmVerifyError class + VerifyErrorCode union
```

### Exports

| Export | Description |
|---|---|
| `Proof` | TypeScript interface for the proof object |
| `decodeProof(b64)` | Decode + validate a base64url proof string |
| `buildCanonical(fields)` | Build the canonical message string |
| `hashCanonical(msg)` | SHA256 of canonical message → 32-byte Buffer |
| `verifySignature(digest, sig, pubkey, alg)` | Verify ed25519 or secp256k1 signature |
| `assertAddressMatchesPubkey(pubkey, account)` | Derive XRPL address from pubkey; throw if mismatch |
| `XrpmVerifyError` | Error class with typed `.code` |
| `VerifyErrorCode` | Union type of all error code strings |

### Error codes thrown by this package

| Code | Trigger |
|---|---|
| `INVALID_PROOF_ENCODING` | base64url decode or JSON parse failed |
| `INVALID_PROOF_SCHEMA` | Required field missing or wrong type |
| `UNSUPPORTED_VERSION` | `v` !== 1 |
| `INVALID_SIGNATURE` | Signature verification failed |
| `ADDRESS_MISMATCH` | Derived address does not match `proof.account` |

### Dependency

- `ripple-keypairs` — XRPL key derivation and signature verification (secp256k1 + ed25519)

---

## 4. Package: `@xrpm-login/eligibility`

**Path:** `packages/eligibility/`
**npm:** `@xrpm-login/eligibility`
**Purpose:** On-chain XRPL checks — account activation and XRPM balance.

```
packages/eligibility/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              checkEligibility() + EligibilityResult + EligibilityOptions
    ├── xrplClient.ts         XRPL JSON-RPC HTTP client + constants
    ├── checkActivated.ts     account_info call
    └── checkXrpmBalance.ts   account_lines call for XRPM trust line
```

### Exports

| Export | Description |
|---|---|
| `checkEligibility(address, opts?)` | Full eligibility check (activation + balance) |
| `checkActivated(address, opts?)` | Account activation only |
| `checkXrpmBalance(address, opts?, minBalance?)` | XRPM balance check only |
| `EligibilityResult` | `{ eligible, activated, balance, reason? }` |
| `EligibilityOptions` | `{ endpoint?, minXrpmBalance? }` |
| `XrplRpcOptions` | `{ endpoint? }` |
| `XRPM_CURRENCY` | Currency hex constant |
| `XRPM_ISSUER` | Issuer address constant |
| `XRPM_MIN_BALANCE` | `10` |
| `XRPL_ENDPOINT` | `https://xrplcluster.com` |

### `EligibilityOptions`

```typescript
interface EligibilityOptions {
  endpoint?: string;        // Override XRPL RPC endpoint
  minXrpmBalance?: number;  // Default: 10. Set 0 for wallet-ownership-only.
}
```

### `checkEligibility()` logic

```
if minXrpmBalance === 0:
  call account_info only
  return { eligible: activated, activated, balance: 'unchecked' }
else:
  call account_info AND account_lines in parallel
  if not activated → NOT_ELIGIBLE
  if balance < minXrpmBalance → NOT_ELIGIBLE
  else → eligible
```

### `EligibilityResult`

```typescript
interface EligibilityResult {
  eligible:   boolean;
  activated:  boolean;
  balance:    string;   // numeric string, "0", "unchecked", or "unknown"
  reason?:    string;   // present when eligible === false
}
```

---

## 5. Package: `@xrpm-login/nonce-store`

**Path:** `packages/nonce-store/`
**npm:** `@xrpm-login/nonce-store`
**Purpose:** Replay prevention. Tracks used nonces so each proof can only be accepted once.

```
packages/nonce-store/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts      NonceStore interface + exports
    ├── memory.ts     MemoryNonceStore (dev/test only — single process)
    ├── redis.ts      RedisNonceStore (production — multi-instance safe)
    └── postgres.ts   PostgresNonceStore (alternative production store)
```

### `NonceStore` interface

```typescript
interface NonceStore {
  consume(nonce: string, ttlSeconds: number): Promise<boolean>;
  // Returns true  → nonce was new, now marked used.
  // Returns false → nonce was already used (replay attack).
}
```

### Which store to use

| Store | When |
|---|---|
| `MemoryNonceStore` | Local development and automated tests only |
| `RedisNonceStore` | Production (single or multi-instance deployments) |
| `PostgresNonceStore` | Production when Redis is not available |

**Never use `MemoryNonceStore` in production.** It loses state on restart and does not work across multiple server instances.

---

## 6. Package: `@xrpm-login/sdk-web`

**Path:** `packages/sdk-web/`
**npm:** `@xrpm-login/sdk-web`
**Purpose:** The partner-server SDK. Provides everything a Node.js/Next.js/Deno server needs to create challenges and verify proofs.

```
packages/sdk-web/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              Re-exports everything
    ├── createChallenge.ts    createChallenge() — generate challenge + deep link
    ├── verifyLogin.ts        verifyLogin()     — full 10-step verification
    ├── openXrpmApp.ts        openXrpmApp()     — helper to open app on mobile
    └── parseCallback.ts      parseCallback()   — extract proof from callback URL
```

### `createChallenge(opts)`

Creates a signed challenge and the deep link to send to the XRPM app.

```typescript
interface ChallengeOptions {
  aud:          string;   // HTTPS URL of your site
  redirect_uri: string;   // HTTPS callback URL (same origin as aud)
  client_id:    string;   // Your app identifier (e.g. your domain)
  ttl?:         number;   // Challenge lifetime in seconds. Default: 300. Max: 3600.
  state?:       string;   // Optional CSRF token echoed back in callback
  min_balance?: number;   // Min XRPM required. Default: 10. Set 0 for wallet-only.
}

interface ChallengeResult {
  challenge: Challenge;   // Full challenge object (store challenge.nonce)
  deepLink:  string;      // xrpm://signin?req=<b64>
}
```

Security enforced by `createChallenge()`:
- `aud` must start with `https://`
- `redirect_uri` must start with `https://`
- `redirect_uri` must share the same origin as `aud`
- `min_balance` must be ≥ 0
- `ttl` is capped at 3600

### `verifyLogin(proofBase64url, opts)`

Full 10-step verification. Throws `XrpmVerifyError` on any failure.

```typescript
interface VerifyLoginOptions {
  expectedAud:         string;      // Must match challenge aud exactly
  expectedRedirectUri: string;      // Must match challenge redirect_uri exactly
  nonceStore:          NonceStore;  // Replay prevention (required)
  checkXRPM?:          boolean;     // Default: true. Set false in dev only.
  minXrpmBalance?:     number;      // Default: 10. Set 0 for wallet-ownership-only.
  xrpl?:               EligibilityOptions;  // Override XRPL endpoint
}

interface VerifyLoginResult {
  valid:       boolean;
  address:     string;           // XRPL wallet address
  balance:     string;           // XRPM balance, "unchecked", or "unknown"
  eligibility: EligibilityResult;
}
```

Verification steps performed in order:
1. Decode proof from base64url JSON
2. Validate schema and version
3. Check `aud` matches `expectedAud`
4. Check `exp` > now (not expired)
5. Consume nonce (replay prevention — atomic)
6. Build canonical message
7. SHA256 hash canonical message
8. Verify signature (ed25519 or secp256k1)
9. Derive address from pubkey — must match `proof.account`
10. Check XRPM balance ≥ `minXrpmBalance` on XRPL (skips balance query when `minXrpmBalance === 0`)

---

## 7. Package: `@xrpm-login/ui-react`

**Path:** `packages/ui-react/`
**npm:** `@xrpm-login/ui-react`
**Purpose:** Drop-in React components for partner websites.

```
packages/ui-react/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts          Exports all components
    ├── LoginButton.tsx   "Sign In With XRPM" button
    ├── QrModal.tsx       QR code modal for desktop with polling
    └── StatusPanel.tsx   Post-login status display
```

### `<LoginButton>` props

```typescript
interface LoginButtonProps {
  startUrl:          string;             // POST endpoint that returns { deep_link, challenge_id }
  onSuccess?:        (address: string, balance: string) => void;
  onError?:          (code: string, message: string) => void;
  onDeepLink?:       (deepLink: string) => void;   // Called on desktop if QR not shown
  onChallengeReady?: (deepLink: string, challengeId: string) => void;  // For cross-device polling
  label?:            string;             // Button text. Default: "Sign In With XRPM"
  theme?:            'light' | 'dark';  // Default: 'light'
}
```

### `<QrModal>` props

```typescript
interface QrModalProps {
  deepLink:   string;            // xrpm://signin?req=... for QR encoding
  pollUrl?:   string;            // /api/auth/poll?challenge_id=... for cross-device
  onSuccess?: (address: string, balance: string) => void;
  onClose?:   () => void;
  theme?:     'light' | 'dark';
}
```

The `QrModal` polls `pollUrl` every 1.5 seconds until the server reports the proof was received and verified.

---

## 8. Package: `@xrpm-login/widget` (Browser Widget)

**Path:** `packages/widget/`
**Built output:** `dist/widget.js` (IIFE, no dependencies)
**Purpose:** Zero-config browser widget. Drop a single `<script>` tag on any page.

```
packages/widget/
├── package.json
├── tsconfig.json
├── build.js         esbuild config — bundles to dist/widget.js
└── src/
    └── widget.ts    Full widget implementation (auto-init + class)
```

### Usage

```html
<script src="https://cdn.xrpmemes.net/xrpm-login/widget.js"></script>

<div
  data-xrpm-login
  data-aud="https://mysite.com"
  data-redirect-uri="https://mysite.com/auth/callback"
  data-client-id="mysite.com"
  data-min-balance="10"
></div>
```

### `data-*` attributes

| Attribute | Default | Description |
|---|---|---|
| `data-aud` | — | **Required.** HTTPS URL of your site. |
| `data-redirect-uri` | value of `data-aud` | HTTPS callback URL. |
| `data-client-id` | `aud` hostname | Your app identifier. |
| `data-api` | `https://api.xrpmemes.net` | Override the hosted API base URL. |
| `data-challenge-url` | `{api}/v1/challenge` | Full challenge POST URL. |
| `data-poll-url` | none | If set, widget polls this URL for cross-device result. |
| `data-label` | `Sign In With XRPM` | Button text. |
| `data-theme` | `light` | `light` or `dark`. |
| `data-ttl` | `300` | Challenge lifetime in seconds. |
| `data-min-balance` | `10` | Min XRPM required. `0` = wallet-only. |

### Events fired on the container element

| Event | Detail | When |
|---|---|---|
| `xrpm:ready` | `{}` | Widget initialised |
| `xrpm:signin` | `{ challengeId }` | Sign-in flow started |
| `xrpm:success` | `{ address, balance }` | Proof verified (via poll only) |
| `xrpm:error` | `{ code, message }` | Any error |

---

## 9. App: `partner-demo-next`

**Path:** `apps/partner-demo-next/`
**Purpose:** Full reference implementation of a partner site using Next.js 14.

```
apps/partner-demo-next/
├── package.json
├── next.config.js
├── .env.example              Copy to .env.local and fill in values
├── pages/
│   ├── index.tsx             Demo homepage with LoginButton + QrModal
│   └── api/auth/
│       ├── start.ts          POST  /api/auth/start     — create challenge
│       ├── callback.ts       GET   /api/auth/callback  — receive proof, verify
│       └── poll.ts           GET   /api/auth/poll      — cross-device polling
└── lib/
    ├── pendingStore.ts        Server-side in-memory pending session store
    └── nonceStore.ts          MemoryNonceStore instance (replace with Redis)
```

### API endpoints

**`POST /api/auth/start`**

Creates a challenge and returns the deep link.

Request body (JSON):
```json
{ "aud": "...", "redirect_uri": "...", "client_id": "...", "ttl": 300, "min_balance": 10 }
```

Response:
```json
{ "challenge_id": "<nonce>", "deep_link": "xrpm://signin?req=...", "expires_at": 1700000300 }
```

Side effect: calls `pendingStore.create(challenge_id, ttl)` to reserve a cross-device slot.

**`GET /api/auth/callback?proof=<b64>[&state=<state>]`**

Receives the proof from the XRPM app redirect.

1. Extracts `nonce` from the proof (before full verification) — this is the `challenge_id`.
2. Calls `verifyLogin(proof, opts)`.
3. On success: calls `pendingStore.resolve(challengeId, address, balance)`.
4. Creates a session cookie and redirects to `/dashboard` (or equivalent).

**`GET /api/auth/poll?challenge_id=<nonce>`**

Used by the desktop browser to poll for cross-device completion.

Responses:
```json
{ "ready": false }                               // Still waiting
{ "ready": true, "address": "r...", "balance": "10.5" }  // Complete
404: { "error": "NOT_FOUND" }                    // Unknown challenge_id
```

### `pendingStore` — Cross-Device Session Linking

```typescript
pendingStore.create(challengeId, ttlSeconds)
// Reserve a slot. Called in /start.

pendingStore.resolve(challengeId, address, balance)
// Mark complete. Called in /callback after verifyLogin succeeds.

pendingStore.consume(challengeId)
// → null      : pending (still waiting)
// → undefined : unknown challenge_id or expired
// → { address, balance } : complete
// Called in /poll. Consuming removes the entry.
```

**Replace with Redis in production.** The in-memory store does not survive restarts and does not work across multiple instances.

### Environment variables

```bash
XRPM_AUD=https://mysite.com
XRPM_REDIRECT_URI=https://mysite.com/auth/callback
XRPM_CLIENT_ID=mysite.com
SESSION_SECRET=<random 32+ char string>
XRPL_ENDPOINT=https://xrplcluster.com   # optional override
MIN_XRPM_BALANCE=10                     # optional override
```

---

## 10. App: `verifier-service` (Optional)

**Path:** `apps/verifier-service/`
**Purpose:** Hosted REST API for partners who cannot run their own backend.

```
apps/verifier-service/
└── src/
    └── server.ts    Express server with /v1/challenge and /v1/verify endpoints
```

This service is hosted at `https://api.xrpmemes.net`. Partners who use the browser widget without their own backend POST to `/v1/challenge` to get a deep link, then use `data-poll-url` to poll for results.

**Dependencies:** Redis (for nonce store + pending store), Express, cors, express-rate-limit.

---

## 11. Scripts — `scripts/`

```
scripts/
└── test-proof.mjs    End-to-end proof test (no network, dev keypair)
```

`test-proof.mjs` runs three tests:
1. Full `verifyLogin()` with a valid freshly-signed proof (`checkXRPM: false`)
2. Replay attack — same proof submitted twice → `NONCE_ALREADY_USED`
3. Tampered signature → `INVALID_SIGNATURE`

All three must pass before any release.

Run:
```bash
node scripts/test-proof.mjs
```

---

## 12. Package Build Order

pnpm resolves this automatically via workspace dependencies, but for reference:

```
1. @xrpm-login/nonce-store     (no internal deps)
2. @xrpm-login/verifier        (no internal deps)
3. @xrpm-login/eligibility     (no internal deps)
4. @xrpm-login/sdk-web         (depends on verifier, eligibility, nonce-store)
5. @xrpm-login/ui-react        (depends on sdk-web)
6. @xrpm-login/widget          (standalone esbuild bundle — no internal deps at build time)
```

---

## 13. `tsconfig.base.json` — Shared TypeScript Config

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

Each package's `tsconfig.json` extends this with `"extends": "../../tsconfig.base.json"`.

**Exception:** `packages/widget/tsconfig.json` adds `"declarationMap": false` and `"noEmit": true` because the widget is bundled by esbuild, not `tsc`.

---

## 14. Locked Design Decisions

These decisions are final for v1. Do not change them without a protocol version bump.

| Decision | Rationale |
|---|---|
| Direct verification (no central auth server) | Partners verify proofs independently against XRPL. No xrpmemes.net involvement at runtime. |
| Canonical message header `XRPM_LOGIN_V1` | Namespaces the signing domain. Prevents cross-protocol signature reuse. |
| SHA256 over canonical string, not raw JSON | JSON serialisation is not deterministic. The canonical format is. |
| Proof includes `account`, `pubkey`, `alg`, `sig` | Server can verify without any prior knowledge of the user's key. |
| Nonce store with TTL = `exp` | Single-use nonces prevent replay. TTL bounds store growth. |
| `min_balance` defaults to `10`, absent = `10` | Preserves backwards compatibility. Old challenges without the field still enforce the standard requirement. |
| `min_balance: 0` skips balance query entirely | Reduces XRPL calls for partners who only need wallet ownership proof. |
| `redirect_uri` must share origin with `aud` | Prevents open redirect attacks where proofs are stolen by a third-party domain. |
| ed25519 and secp256k1 both supported | Matches XRPL's key types. Users with either key type can sign in. |

---

## 15. Release Checklist

Before tagging a new release:

- [ ] `node scripts/test-proof.mjs` — all 3 tests pass
- [ ] `pnpm build` — all 6 packages build without errors
- [ ] Version bumped in all `package.json` files (packages only, not apps)
- [ ] `XRPM_LOGIN_V1.md` updated if protocol changed
- [ ] `threat-model.md` reviewed for any new attack surfaces
- [ ] `.npmignore` present in all published packages
- [ ] No `src/` files accidentally included in npm publish (`pnpm pack --dry-run`)

---

*SDK repo: github.com/xrpmemes/xrpm-login*
*This document supersedes XRPM_Repo_Blueprint_v1.pdf*
