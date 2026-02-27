# XRPM_LOGIN_V1 Protocol Specification

**Status:** Locked
**Version:** 1
**Date:** 2026-02-26

---

## Overview

XRPM_LOGIN_V1 is a challenge-response authentication protocol that proves:

1. The user controls the private key of a specific XRP Ledger wallet address.
2. That wallet holds at least 10 XRPM tokens at the time of verification.

No password, email, or OAuth server is required. The XRPM mobile app acts as
the signing device. Partner websites verify proofs directly against the XRPL.

---

## Actors

| Actor | Role |
|---|---|
| **Partner Website** | Generates the challenge; verifies the proof |
| **XRPM Mobile App** | Holds the user's private key; signs the challenge |
| **XRP Ledger** | Source of truth for wallet ownership and XRPM balances |
| **XRPMEMES** | Publishes this spec and the SDK; not in the auth path at runtime |

---

## Protocol Flow

```
Partner Website                XRPM App                   XRPL
───────────────                ────────                   ────
1. Generate challenge JSON
   (aud, nonce, exp, ...)
   → base64url encode
   → build deep link:
     xrpm://signin?req=<b64>

2. Show QR (desktop) or
   open link (mobile)  ──────► 3. Receive deep link
                                   Parse challenge JSON
                                   Validate exp (not expired)
                                   Validate aud (HTTPS URL)
                                                        ◄── 4. account_info
                                                             (check activated)
                                                        ◄── 5. account_lines
                                                             (XRPM ≥ 10)
                                6. Show consent screen:
                                   Domain, address,
                                   eligibility badge
                                7. User approves
                                   Build canonical message
                                   SHA256(canonical)
                                   Sign with private key
                                   Build proof JSON
                                   base64url encode

8. Receive callback   ◄──────── 9. Redirect to redirect_uri:
   ?proof=<b64>                    ?proof=<b64>&state=<s>
   [&state=<state>]

10. Decode proof
11. Verify signature
12. Derive address from pubkey
    → must match proof.account
13. Re-check XRPM balance  ─────────────────────────────► account_lines
14. Session created ✅
```

---

## 1. Deep Link Contract

The partner website sends this deep link to the XRPM app:

```
xrpm://signin?req=<base64url(challenge_json)>
```

### Challenge JSON Schema

```json
{
  "v": 1,
  "aud": "https://partner.com",
  "nonce": "<base64url 32 random bytes>",
  "iat": 1700000000,
  "exp": 1700000300,
  "client_id": "partner.com",
  "redirect_uri": "https://partner.com/auth/callback",
  "state": "opaque_csrf_string"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `v` | integer | yes | Protocol version. Must be `1`. |
| `aud` | string | yes | HTTPS URL of the partner site. |
| `nonce` | string | yes | base64url of 32 random bytes. Single-use. |
| `iat` | integer | yes | Unix timestamp when challenge was issued. |
| `exp` | integer | yes | Unix timestamp when challenge expires. |
| `client_id` | string | yes | Partner identifier (e.g. domain). |
| `redirect_uri` | string | yes | HTTPS callback URL for the proof. |
| `state` | string | no | Opaque CSRF token echoed in callback. |

**Constraints:**
- `aud` and `redirect_uri` must be HTTPS URLs.
- `redirect_uri` must be a sub-path of `aud` or exactly equal to `aud`.
- `exp - iat` must not exceed 3600 seconds (1 hour).

---

## 2. Canonical Message Format

The XRPM app builds this exact string before signing:

```
XRPM_LOGIN_V1\n
aud=<aud>\n
nonce=<nonce>\n
iat=<iat>\n
exp=<exp>\n
client_id=<client_id>
```

- Fields are newline-separated (`\n`, 0x0A).
- No trailing newline.
- Values are the exact string values from the challenge JSON.
- The string is UTF-8 encoded before hashing.

---

## 3. Signing Rules

```
bytes   = UTF8(canonical_message)
digest  = SHA256(bytes)                          // 32 bytes
sig     = sign(digest, private_key)              // ed25519 or secp256k1
sig_b64 = base64url(sig_raw_bytes)               // base64url, no padding
```

- The signature is over the **raw SHA256 digest bytes**, not the hex string.
- The signature output is the **raw signature bytes**, base64url encoded.
- Both ed25519 and secp256k1 keys are supported.

---

## 4. Proof Object

The XRPM app sends this to `redirect_uri`:

```json
{
  "v": 1,
  "aud": "https://partner.com",
  "nonce": "<same nonce from challenge>",
  "iat": 1700000100,
  "exp": 1700000300,
  "client_id": "partner.com",
  "account": "rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "pubkey": "ED1234...ABCD",
  "alg": "ed25519",
  "sig": "<base64url raw signature bytes>"
}
```

| Field | Description |
|---|---|
| `v` | Must be `1` |
| `aud` | Copied from challenge |
| `nonce` | Copied from challenge |
| `iat` | Signing timestamp (may differ slightly from challenge `iat`) |
| `exp` | Copied from challenge |
| `client_id` | Copied from challenge |
| `account` | XRPL classic address (rAddress) |
| `pubkey` | Public key as uppercase hex |
| `alg` | `"ed25519"` or `"secp256k1"` |
| `sig` | base64url-encoded raw signature bytes |

---

## 5. Redirect Response

The XRPM app redirects the user's browser to:

```
<redirect_uri>?proof=<base64url(proof_json)>[&state=<state>]
```

The `proof` query parameter is the base64url encoding of the **full proof
JSON object**.

---

## 6. Verification Steps (Partner Server)

The partner server MUST perform all of the following in order:

1. **Decode** `proof` from base64url → JSON.
2. **Check `aud`** matches the partner's own callback URL exactly.
3. **Check `exp`** > current server time (proof not expired).
4. **Check `v`** === 1.
5. **Check nonce** has not been seen before; mark it as used (TTL = `exp`).
6. **Reconstruct** the canonical message from proof fields.
7. **SHA256** the canonical message bytes → 32-byte digest.
8. **Verify signature**: `verify(digest, base64url_decode(sig), pubkey)`.
9. **Derive address** from `pubkey` → must equal `proof.account`.
10. **Check XRPM balance** on XRPL: `account_lines` with peer = XRPM issuer,
    balance ≥ 10.

If any step fails → reject with the appropriate error. Never short-circuit.

---

## 7. XRPM Token Constants

```
Currency code (hex): 5852504D00000000000000000000000000000000
Issuer address:      r9mZNnos1GLtc55tkmr21G9BgXxV7w9hT1
Minimum balance:     10 XRPM
XRPL endpoint:       https://xrplcluster.com
```

---

## 8. Error Codes (App → Partner)

These are returned by the XRPM app to the partner's `redirect_uri`:

| Code | Meaning |
|---|---|
| `USER_REJECTED` | User declined the consent screen |
| `EXPIRED_CHALLENGE` | Challenge `exp` was in the past when the app processed it |
| `INVALID_REDIRECT` | `redirect_uri` failed the app's allowlist check |
| `NOT_ELIGIBLE` | Wallet holds less than 10 XRPM |

---

## 9. Security Properties

| Property | Mechanism |
|---|---|
| Proof of key ownership | ed25519/secp256k1 signature over SHA256(canonical) |
| Cross-site replay prevention | `aud` bound to the challenge; verified server-side |
| Replay prevention | Nonce is single-use with server-side TTL |
| Expiry | `exp` enforced server-side, not just in app |
| Balance integrity | Balance re-checked server-side via XRPL |
| Address integrity | `account` must match `deriveAddress(pubkey)` |

---

## 10. Out of Scope

- Session management after login (partner's responsibility).
- Continuous XRPM balance monitoring.
- Key rotation or wallet recovery.
- Multi-signature wallets.
