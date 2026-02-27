# XRPM App — Sign In With XRPM
## Implementation Guide for App Developers
**Protocol: XRPM_LOGIN_V1 · Version 2 · 2026-02-26**

---

## Purpose

This document tells the XRPM mobile app development team exactly what the app must do when it receives a "Sign In With XRPM" request from a partner website. Every step here is required. Nothing is optional unless marked.

The app acts as a **cryptographic signing device**. It never sends passwords or secrets to anyone. It reads a challenge from a deep link, validates it, asks the user for consent, signs the challenge with the user's private key, and redirects back to the partner website with a signed proof.

---

## 1. Big Picture — What the App Does

```
Partner website                XRPM App                        XRPL
───────────────                ────────                        ────

Creates a challenge
Encodes it as a deep link
Shows QR code (desktop) ──►  Receives xrpm://signin?req=…
Or opens link (mobile)
                              Decodes challenge JSON
                              Validates fields (exp, aud…)
                                                         ──►  account_info
                                                              (is wallet activated?)
                                                         ──►  account_lines
                                                              (XRPM balance check)
                              Shows consent screen
                              User taps "Approve"
                              Builds canonical message
                              SHA256 → sign with private key
                              Builds proof JSON
                              base64url encodes proof

Partner receives proof  ◄──   Redirects browser to:
                              redirect_uri?proof=<b64>
                              (&state=<state> if present)

Partner verifies proof
Creates user session ✅
```

---

## 2. Deep Link Contract

The partner website sends this deep link to the app:

```
xrpm://signin?req=<base64url(challenge_json)>
```

The `req` parameter is the **base64url encoding** (no padding `=` characters) of the challenge JSON object.

### 2.1 Challenge JSON — All Fields

```json
{
  "v": 1,
  "aud": "https://partner.com",
  "nonce": "9bUadvfgtP087WYLiMf-uqYyqGjF6vk8DsiWWJ9w8D0",
  "iat": 1700000000,
  "exp": 1700000300,
  "client_id": "partner.com",
  "redirect_uri": "https://partner.com/auth/callback",
  "state": "csrf_token_here",
  "min_balance": 50
}
```

### 2.2 Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `v` | integer | **yes** | Protocol version. Must be `1`. Reject anything else. |
| `aud` | string | **yes** | HTTPS URL of the partner site. |
| `nonce` | string | **yes** | base64url of 32 random bytes. One-time use. |
| `iat` | integer | **yes** | Unix timestamp: when the challenge was created. |
| `exp` | integer | **yes** | Unix timestamp: when the challenge expires. |
| `client_id` | string | **yes** | Partner identifier (usually the domain). |
| `redirect_uri` | string | **yes** | HTTPS URL where the proof is sent. Must be under `aud` origin. |
| `state` | string | no | Opaque CSRF token. Echo it back unchanged in the redirect. |
| `min_balance` | integer | no | Minimum XRPM tokens required. **Default: 10 when absent.** `0` = wallet-ownership-only (any activated wallet may sign in). |

> **`min_balance` is new.** Partners that want no XRPM requirement set `min_balance: 0`.
> If the field is absent, treat it as `10`. Never treat absent as `0`.

---

## 3. Challenge Validation

**Perform these checks immediately after decoding. Reject before showing any UI.**

| Step | Check | Error if fails |
|---|---|---|
| 1 | `v` === 1 | Show: "Unsupported challenge version" |
| 2 | `aud` starts with `https://` | Show: "Invalid partner URL" |
| 3 | `redirect_uri` starts with `https://` | `INVALID_REDIRECT` |
| 4 | `redirect_uri` origin === `aud` origin | `INVALID_REDIRECT` |
| 5 | `exp` > current device time (with ±30 s clock skew allowance) | `EXPIRED_CHALLENGE` |
| 6 | `min_balance` is absent or a non-negative integer | Show: "Invalid challenge" |

**Do not silently ignore any failure.** Redirect to `redirect_uri?error=<ERROR_CODE>` or show an error screen.

---

## 4. XRPL Eligibility Pre-Check

Before showing the consent screen, verify the user's wallet meets the partner's requirements. This check is **for the user's information only** — the partner server will re-verify independently.

### 4.1 Determine the required balance

```
required = challenge.min_balance ?? 10
```

### 4.2 Step A — Check account is activated

XRPL JSON-RPC call:

```json
{
  "method": "account_info",
  "params": [{ "account": "<user_address>", "ledger_index": "current" }]
}
```

- If `result.status === "error"` and `error === "actNotFound"` → wallet not activated → show error, redirect with `NOT_ELIGIBLE`.
- Any other network error → show "Unable to check eligibility, try again."

### 4.3 Step B — Check XRPM balance (skip when required === 0)

When `required > 0`, make this call:

```json
{
  "method": "account_lines",
  "params": [{
    "account": "<user_address>",
    "peer": "r9mZNnos1GLtc55tkmr21G9BgXxV7w9hT1",
    "ledger_index": "current"
  }]
}
```

Find the trust line where:
```
currency === "5852504D00000000000000000000000000000000"
account  === "r9mZNnos1GLtc55tkmr21G9BgXxV7w9hT1"
```

Parse `balance` as a float. If no matching line, balance = `0`.

If `balance < required` → redirect with `NOT_ELIGIBLE`.

### 4.4 XRPL Constants

```
Currency code (hex):  5852504D00000000000000000000000000000000
XRPM Issuer address:  r9mZNnos1GLtc55tkmr21G9BgXxV7w9hT1
Default min balance:  10
XRPL endpoint:        https://xrplcluster.com
```

---

## 5. Consent Screen

Show the user a clear, unambiguous approval screen before signing anything.

### 5.1 Required elements

| Element | Content | Notes |
|---|---|---|
| Partner domain | `new URL(challenge.aud).hostname` | Large text, prominent |
| User wallet | `rXXXXX...` (truncated OK) | Show the address that will be used |
| Balance requirement | See §5.2 | Show exact threshold |
| "Approve" button | — | Triggers signing |
| "Reject" button | — | Redirects with `USER_REJECTED` |

### 5.2 Balance requirement display

| `min_balance` value | Text to show |
|---|---|
| absent (treat as 10) | "Requires ≥ 10 XRPM · Your balance: X.XX XRPM ✓/✗" |
| `0` | "No XRPM required · Any activated wallet may sign in" |
| positive N | "Requires ≥ N XRPM · Your balance: X.XX XRPM ✓/✗" |

### 5.3 Security note

Display the domain in a tamper-evident style (e.g. browser-style address bar UI). Users must be able to confirm they are signing for the correct site.

---

## 6. Building the Canonical Message

After the user approves, build this exact string:

```
XRPM_LOGIN_V1\n
aud=<aud>\n
nonce=<nonce>\n
iat=<iat>\n
exp=<exp>\n
client_id=<client_id>
```

### 6.1 Rules — follow exactly

- Separator is `\n` (line feed, `0x0A`). **Not `\r\n`.**
- **No trailing newline** after `client_id=<client_id>`.
- Values are taken verbatim from the challenge JSON as strings.
- `iat` and `exp` are the **integer values** serialised as decimal strings (e.g. `"1700000000"`, not `"1.7e9"`).
- The entire string is **UTF-8 encoded** before hashing.

### 6.2 Example

Given a challenge with:
```
aud        = https://test.xrpmemes.net
nonce      = 9bUadvfgtP087WYLiMf-uqYyqGjF6vk8DsiWWJ9w8D0
iat        = 1772118488
exp        = 1772118788
client_id  = test.xrpmemes.net
```

The canonical message string (showing `↵` for newline) is:
```
XRPM_LOGIN_V1↵
aud=https://test.xrpmemes.net↵
nonce=9bUadvfgtP087WYLiMf-uqYyqGjF6vk8DsiWWJ9w8D0↵
iat=1772118488↵
exp=1772118788↵
client_id=test.xrpmemes.net
```

The SHA256 of this string (UTF-8) is:
```
7BB0C14C3D63D39454E32E5C82A62EA1BE0BB8C98D4C36BA171135634FAEDC51
```

Use this as a test vector.

---

## 7. Signing Algorithm

```
bytes      = UTF8_encode(canonical_message)
digest     = SHA256(bytes)                       // 32 raw bytes
sig_bytes  = sign(digest, private_key, alg)      // raw bytes output
sig        = base64url_encode(sig_bytes)         // no padding '='
```

### 7.1 Key type rules

| Key prefix in hex | Algorithm | `alg` value in proof |
|---|---|---|
| `ED` | Ed25519 | `"ed25519"` |
| `02` or `03` | secp256k1 | `"secp256k1"` |

### 7.2 Signing details

**Ed25519:**
- Sign the **raw 32-byte SHA256 digest** directly.
- Output: 64-byte raw signature.
- Do not pre-hash again inside the Ed25519 function if your library does its own internal hash. Use the **"sign raw bytes" or "sign prehash"** mode.
- On iOS: `SecKeyCreateSignature` with `kSecKeyAlgorithmEdDSASignatureMessageX9_62SHA512` does **not** apply here. Use a library that allows signing the digest directly, such as `CryptoKit` with `Curve25519.Signing`.
- On Android: Use Bouncy Castle or Tink with the raw digest.

**secp256k1:**
- Sign the **raw 32-byte SHA256 digest** using ECDSA.
- Output: DER-encoded signature bytes.
- base64url encode the DER bytes.
- On iOS/Android: Use the same secp256k1 library your wallet already uses for XRPL transaction signing.

### 7.3 Critical: what NOT to do

- ❌ Do not sign the hex string of the digest.
- ❌ Do not sign the canonical message string directly (always SHA256 first).
- ❌ Do not add extra newlines or spaces to the canonical message.
- ❌ Do not use base64 with padding — must be base64url without `=`.

---

## 8. Building the Proof Object

Construct this JSON object:

```json
{
  "v": 1,
  "aud": "https://partner.com",
  "nonce": "<nonce from challenge>",
  "iat": 1700000100,
  "exp": 1700000300,
  "client_id": "partner.com",
  "account": "rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "pubkey": "ED1234ABCD...",
  "alg": "ed25519",
  "sig": "<base64url raw signature>"
}
```

### 8.1 Field values

| Field | Source |
|---|---|
| `v` | Always `1` |
| `aud` | Copy from challenge |
| `nonce` | Copy from challenge (exactly, do not re-generate) |
| `iat` | Current Unix timestamp at signing time |
| `exp` | Copy from challenge |
| `client_id` | Copy from challenge |
| `account` | User's XRPL address (classic rAddress format) |
| `pubkey` | User's public key as **uppercase hex** |
| `alg` | `"ed25519"` or `"secp256k1"` |
| `sig` | Output of §7 — base64url, no padding |

### 8.2 Encoding the proof

```
proof_json      = JSON.stringify(proof_object)   // compact JSON, no extra spaces
proof_b64url    = base64url_encode(UTF8(proof_json))  // no padding '='
```

---

## 9. Redirect Response

Open the redirect URL in the user's browser:

```
<redirect_uri>?proof=<proof_b64url>[&state=<state>]
```

- `proof` is the base64url of the full proof JSON.
- If `state` was present in the challenge, append `&state=<state>` unchanged.
- If `state` was absent, do not include the `state` parameter at all.
- Use an HTTP `302` redirect or `window.open` / deep link back to the browser.

### 9.1 Mobile vs cross-device

**Same-device (mobile web):**
The user opened the partner website on their phone, tapped "Sign In", the app was launched via deep link. After signing, open the browser back to `redirect_uri?proof=…`. The partner's callback page handles the rest.

**Cross-device (QR scan):**
The user scanned a QR code on their phone from a desktop browser session. The app was launched on the phone. After signing, redirect the **phone's browser** to `redirect_uri?proof=…`. The partner server also provides a polling endpoint (`/api/auth/poll?challenge_id=<nonce>`); the desktop browser is polling this endpoint every 1.5 seconds and will update automatically when the proof lands.

In both cases the app's job is the same: redirect to `redirect_uri?proof=…`.

---

## 10. Error Redirect

When any step fails (after the user has seen the consent screen, or during validation), redirect to:

```
<redirect_uri>?error=<ERROR_CODE>[&state=<state>]
```

### 10.1 Error codes

| Code | When to use |
|---|---|
| `USER_REJECTED` | User tapped "Reject" on the consent screen |
| `EXPIRED_CHALLENGE` | `exp` was already in the past at parse time |
| `INVALID_REDIRECT` | `redirect_uri` failed origin check against `aud` |
| `NOT_ELIGIBLE` | Wallet not activated, or XRPM balance < `min_balance` |

If `redirect_uri` itself is invalid (cannot be parsed as a URL), show an in-app error and do not redirect.

---

## 11. Security Requirements

| Requirement | Detail |
|---|---|
| Private key storage | Store in iOS Keychain / Android Keystore. Never in UserDefaults, SharedPreferences, or plain files. |
| Private key access | Never send the private key over any network. Never log it. |
| Domain display | Show `aud` domain on consent screen in a clearly distinguished UI element. Users must be able to verify it. |
| `redirect_uri` validation | Reject any `redirect_uri` that does not share the same origin as `aud`. Log the attempt. |
| HTTPS enforcement | Only accept `https://` for `aud` and `redirect_uri`. Hard-block `http://`. |
| Challenge expiry | Always check `exp` against device clock. Allow ±30 seconds clock skew. |
| No caching of proofs | Each sign-in produces a new nonce, new signature, new proof. Never reuse a proof. |
| No logging of sensitive data | Do not log `nonce`, `sig`, `pubkey`, or private keys. |

---

## 12. Platform Notes

### iOS

- Deep link scheme `xrpm://` must be registered in `Info.plist` under `LSApplicationQueriesSchemes` and `CFBundleURLSchemes`.
- Use `CryptoKit` for Ed25519 (`Curve25519.Signing.PrivateKey`) or the secp256k1 library already used for XRPL signing.
- Store keys in the Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.
- To redirect back to the browser: use `UIApplication.shared.open(redirectURL)`.

### Android

- Register the `xrpm://` scheme in `AndroidManifest.xml` with an `intent-filter`.
- Use `org.bouncycastle` or Google Tink for signing.
- Store keys in Android Keystore with `KeyProperties.PURPOSE_SIGN`.
- To redirect back to the browser: use `Intent(Intent.ACTION_VIEW, Uri.parse(redirectUrl))`.

---

## 13. Implementation Checklist

Work through this list top-to-bottom. All items are required.

### Deep Link & Parsing
- [ ] Register `xrpm://` URL scheme on iOS and Android
- [ ] Parse `xrpm://signin?req=<value>` to extract `req`
- [ ] base64url decode `req` → JSON string → parse to challenge object
- [ ] Validate all required fields are present (`v`, `aud`, `nonce`, `iat`, `exp`, `client_id`, `redirect_uri`)
- [ ] Validate `v === 1`
- [ ] Validate `aud` starts with `https://`
- [ ] Validate `redirect_uri` starts with `https://` and shares origin with `aud`
- [ ] Validate `exp > now` (allow ±30 s clock skew)
- [ ] Read `min_balance` field; default to `10` if absent

### Eligibility Pre-Check (UX only)
- [ ] Call `account_info` for user's wallet — confirm activation
- [ ] If `min_balance > 0`: call `account_lines` — confirm XRPM balance ≥ `min_balance`
- [ ] If `min_balance === 0`: skip balance check, only activation required
- [ ] Handle XRPL network errors gracefully (show retry option, do not crash)

### Consent Screen
- [ ] Display partner domain (`aud` hostname) prominently
- [ ] Display user's XRPL address
- [ ] Display balance requirement and user's actual balance (show ✓ or ✗)
- [ ] Show "Approve" and "Reject" buttons
- [ ] Reject → redirect with `USER_REJECTED`

### Signing
- [ ] Build canonical message (exact format per §6, no trailing newline)
- [ ] UTF-8 encode canonical message
- [ ] SHA256 hash → 32-byte raw digest
- [ ] Sign digest with user's private key (ed25519 or secp256k1)
- [ ] base64url encode raw signature bytes (no padding)

### Proof Assembly & Redirect
- [ ] Assemble proof object with all required fields (§8)
- [ ] Serialize proof as compact JSON
- [ ] base64url encode proof JSON (no padding)
- [ ] Redirect browser to `redirect_uri?proof=<b64>[&state=<state>]`

### Error Handling
- [ ] All validation failures → redirect with appropriate error code
- [ ] Invalid `redirect_uri` → in-app error (no redirect possible)
- [ ] XRPL unavailable → show retry, do not redirect with error (transient)

### Security
- [ ] Private key never leaves device
- [ ] Keys stored in Keychain/Keystore
- [ ] `aud` domain verified before any key access
- [ ] No sensitive data logged

---

## 14. Test Vector

Use these values to validate your canonical message builder and signing implementation.

```
Address:    rnRGVAhsB2g3t3TbF3be51HE2e9SKfHi65
Algorithm:  secp256k1
PubKey:     03B70388240F3F9323D487C922B3B84E3D3F1552961CC95C688E7AA92FB544708A

Challenge:
  aud        = https://test.xrpmemes.net
  nonce      = 9bUadvfgtP087WYLiMf-uqYyqGjF6vk8DsiWWJ9w8D0
  iat        = 1772118488
  exp        = 1772118788
  client_id  = test.xrpmemes.net

Canonical message (exact bytes):
  XRPM_LOGIN_V1\n
  aud=https://test.xrpmemes.net\n
  nonce=9bUadvfgtP087WYLiMf-uqYyqGjF6vk8DsiWWJ9w8D0\n
  iat=1772118488\n
  exp=1772118788\n
  client_id=test.xrpmemes.net

SHA256 of canonical (hex):
  7BB0C14C3D63D39454E32E5C82A62EA1BE0BB8C98D4C36BA171135634FAEDC51
```

If your canonical message builder produces a different SHA256, stop and fix it before proceeding to signing.

---

## 15. Glossary

| Term | Meaning |
|---|---|
| `aud` | Audience — the partner site's HTTPS origin |
| `nonce` | A random single-use value that prevents replay attacks |
| `exp` | Expiry — Unix timestamp after which the challenge is invalid |
| `redirect_uri` | The URL where the app sends the signed proof back to the partner |
| `canonical message` | The exact text string that is hashed and signed |
| `proof` | The signed object the app sends back to the partner |
| `min_balance` | Minimum XRPM tokens the signing wallet must hold |
| `base64url` | base64 with `+→-`, `/→_`, no `=` padding |
| rAddress | XRPL classic address starting with `r` |

---

*Protocol: XRPM_LOGIN_V1 · SDK repo: github.com/xrpmemes/xrpm-login*
*This document supersedes XRPM_App_Signing_Implementation_Guide_v1.pdf*
