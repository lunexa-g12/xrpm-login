# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x     | ✅ Active development |

---

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**
Public disclosure before a fix is available puts all partners using this SDK
at risk.

### How to report

1. Email **security@xrpmemes.net** with the subject line:
   `[SECURITY] xrpm-login — <brief description>`

2. Include:
   - A clear description of the vulnerability
   - Steps to reproduce (proof of concept if possible)
   - The potential impact (what an attacker could achieve)
   - Your suggested fix (optional but appreciated)

3. You will receive an acknowledgement within **48 hours**.

4. We aim to release a patch within **7 days** of confirmation for critical
   issues and **30 days** for lower-severity issues.

5. Once a fix is released, we will publicly credit you in the release notes
   (unless you prefer to remain anonymous).

---

## Scope

The following are **in scope** for security reports:

- Signature verification bypass in `packages/verifier/`
- Nonce replay attacks in `packages/nonce-store/`
- XRPM balance check bypass in `packages/eligibility/`
- Open redirect vulnerabilities in `packages/sdk-web/`
- Prototype pollution, dependency confusion, or supply chain issues
- Cryptographic weaknesses in the XRPM_LOGIN_V1 protocol implementation

The following are **out of scope**:

- Vulnerabilities in the XRPM mobile app itself (report to the app team)
- Issues in partner integrations (i.e. how a partner uses the SDK)
- Social engineering attacks (phishing, impersonation)
- Rate limiting on partner-hosted endpoints (partners are responsible)

---

## Security Design Principles

This SDK is designed around the following security guarantees:

1. **Private keys never leave the user's device.** The SDK never requests,
   receives, or handles private keys in any form.

2. **Direct verification.** No XRPMEMES server is involved in the
   authentication path. Partners verify proofs directly against the XRPL.

3. **Replay prevention.** Every nonce is single-use with a server-side TTL.
   Expired or reused nonces are rejected.

4. **Audience binding.** The `aud` and `redirect_uri` fields in the proof
   must match exactly. A proof generated for site A cannot be used on site B.

5. **Server-side balance check.** The XRPM balance is always re-verified
   server-side. The app-side eligibility check is UX only and is not trusted.

6. **Fail closed.** Any step in the verification pipeline that fails causes
   the entire proof to be rejected. There is no partial success.

---

## Dependency Security

We pin all dependencies and run automated vulnerability scanning via
GitHub Dependabot. Partners should audit their own dependency trees when
integrating this SDK.
