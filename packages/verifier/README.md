# @xrpm-login/verifier

Low-level, pure-crypto verifier for XRPM_LOGIN_V1 proofs. **No network calls.**

Use this package if you need fine-grained control. For most integrations use [`@xrpm-login/sdk-web`](../sdk-web) instead.

## Install

```bash
npm install @xrpm-login/verifier
```

## Usage

```js
const {
  decodeProof,
  buildCanonical,
  hashCanonical,
  verifySignature,
  assertAddressMatchesPubkey,
  XrpmVerifyError,
} = require('@xrpm-login/verifier');

// 1. Decode and validate the proof schema
const proof = decodeProof(proofBase64url);

// 2. Build and hash the canonical message
const canonical = buildCanonical({
  aud:       proof.aud,
  nonce:     proof.nonce,
  iat:       proof.iat,
  exp:       proof.exp,
  client_id: proof.client_id,
});
const digest = hashCanonical(canonical); // Buffer (32 bytes)

// 3. Verify signature (ed25519 or secp256k1)
verifySignature(digest, proof.sig, proof.pubkey, proof.alg);

// 4. Verify address matches pubkey
assertAddressMatchesPubkey(proof.pubkey, proof.account);

// All checks passed — proof.account is the authenticated address
```

## Canonical Message Format

```
XRPM_LOGIN_V1
aud=https://mysite.com
nonce=<base64url-32-bytes>
iat=<unix-timestamp>
exp=<unix-timestamp>
client_id=mysite.com
```

Lines joined by `\n`. SHA256 of UTF-8 bytes.

## Signing

- `proof.sig` = base64url of the **raw signature bytes**
- For ed25519: 64 bytes
- For secp256k1: DER-encoded bytes

The canonical message is signed, not the raw digest — the XRPM app handles this.

---

MIT License — see [DISCLAIMER](../../DISCLAIMER.md).
