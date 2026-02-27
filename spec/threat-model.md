# XRPM_LOGIN_V1 Threat Model

## Assets

| Asset | Owner | Protection |
|---|---|---|
| User private key | User (device) | Never leaves device; Keychain/Keystore |
| Challenge nonce | Partner server | Single-use TTL store (memory/Redis/Postgres) |
| Proof object | In-transit | HTTPS; short expiry; audience-bound |
| XRPM balance | XRP Ledger | Re-verified server-side on every login |
| Partner session | Partner server | Partner's responsibility (JWT, cookies) |

---

## Threat Scenarios

### T1 — Replay Attack
**Scenario:** Attacker captures a valid proof and submits it again.
**Mitigations:**
- Nonce is single-use; stored with TTL = `exp`.
- `exp` is enforced server-side; proofs expire in ≤ 3600 seconds.
- Challenge is deleted from the nonce store on first use.

### T2 — Cross-Site Replay
**Scenario:** Attacker uses a proof generated for site A on site B.
**Mitigations:**
- `aud` is bound to the challenge; verified on the partner server.
- `redirect_uri` must belong to the same origin as `aud`.
- Proof for `https://site-a.com` will fail on `https://site-b.com`.

### T3 — Forged Proof
**Scenario:** Attacker constructs a proof claiming to own a wallet they don't control.
**Mitigations:**
- Signature is over `SHA256(canonical_message)` with the wallet's private key.
- Server derives the XRPL address from `pubkey` and checks it equals `account`.
- Forging a valid signature requires the wallet's private key.

### T4 — Algorithm Confusion
**Scenario:** Attacker submits a proof with a mismatched `alg` and `pubkey`.
**Mitigations:**
- Verifier checks that `pubkey` prefix (`ED` / `02` / `03`) matches `alg`.
- ripple-keypairs internally validates key type before verifying.

### T5 — Balance Manipulation
**Scenario:** User transfers XRPM out of the wallet after the app checks balance.
**Mitigations:**
- Balance is re-verified server-side after signature is validated.
- The app-side balance check is for UX (consent screen) only.
- **Note:** This is a point-in-time check. Continuous balance monitoring
  is the partner's responsibility.

### T6 — Expired Challenge Reuse
**Scenario:** Attacker holds a proof until it expires, then submits it to a server
with a lenient clock.
**Mitigations:**
- `exp` is checked against the server's clock, not the client's.
- Servers SHOULD use NTP synchronisation.
- Nonce store TTL is set to `exp` — even if the clock check fails, the nonce
  will have already expired from the store.

### T7 — Open Redirect
**Scenario:** Attacker sets `redirect_uri` to a domain they control to capture proofs.
**Mitigations:**
- `createChallenge()` enforces that `redirect_uri` is an HTTPS URL.
- The XRPM app MUST validate `redirect_uri` against a registered allowlist
  or enforce that it belongs to the same origin as `aud`.
- Partners should register their allowed callback URLs.

### T8 — Phishing / Impersonation
**Scenario:** Attacker clones the XRPM consent UI to trick users into signing.
**Mitigations:**
- The XRPM app displays the `aud` domain prominently on the consent screen.
- Private keys never leave the device.
- Users should verify the domain shown matches the site they are on.
- **Residual risk:** Social engineering is out of scope for this protocol.

### T9 — Supply Chain Attack
**Scenario:** Attacker publishes a malicious version of an SDK dependency.
**Mitigations:**
- All dependencies are pinned with exact versions.
- GitHub Dependabot alerts are enabled.
- pnpm lockfile is committed and verified in CI.
- Partners should audit their own dependency trees.

### T10 — Denial of Service (XRPL RPC)
**Scenario:** High login volume overwhelms the XRPL public endpoint.
**Mitigations:**
- The verifier service applies per-IP rate limiting.
- Partners can configure a private XRPL node or a load-balanced cluster.
- The public `xrplcluster.com` endpoint is operated by a third party;
  SLAs are not guaranteed.

---

## Out of Scope

- Session hijacking after login (partner's session management).
- Physical device compromise (Keychain/Keystore protects keys at rest).
- Malware on the user's device.
- DNS spoofing of the XRPL RPC endpoint (use HTTPS with cert pinning).
