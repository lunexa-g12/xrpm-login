# Disclaimer — Sign In With XRPM SDK

> **Read this before integrating the SDK into your product.**

---

## 1. Authentication Tool Only

The Sign In With XRPM SDK ("the SDK") is a cryptographic authentication
tool. It proves that a user controls a specific XRP Ledger wallet and that
the wallet held at least 10 XRPM tokens **at the moment of verification**.

It is **not** a financial product, payment processor, custodian, investment
service, or ongoing eligibility monitor.

---

## 2. Point-in-Time Balance Check

The XRPM token balance is verified against the XRP Ledger **at the time of
login only**. A user may transfer, sell, or otherwise reduce their XRPM
balance after a successful sign-in.

Partners who require continuous eligibility (e.g. gated content, token-gated
access) are responsible for implementing their own periodic re-checks.

---

## 3. Partner Responsibility

By integrating this SDK, you ("the Partner") acknowledge sole responsibility
for:

- The security of your own servers, databases, and session management.
- Implementing adequate rate limiting, bot protection, and abuse prevention.
- Compliance with all applicable laws, regulations, and privacy requirements
  in your jurisdiction (including but not limited to GDPR, CCPA).
- Informing your users clearly about how their wallet address and
  authentication data are collected, stored, and used.
- Ensuring your `redirect_uri` / callback URL is secured against unauthorized
  access.

---

## 4. No Warranty

THE SDK IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. THE ENTIRE RISK AS
TO THE QUALITY AND PERFORMANCE OF THE SDK IS WITH YOU.

---

## 5. Limitation of Liability

IN NO EVENT SHALL THE AUTHORS, COPYRIGHT HOLDERS, OR XRPMEMES PROJECT BE
LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY — WHETHER IN AN ACTION OF
CONTRACT, TORT, OR OTHERWISE — ARISING FROM, OUT OF, OR IN CONNECTION WITH
THE SDK OR THE USE OR OTHER DEALINGS IN THE SDK. THIS INCLUDES BUT IS NOT
LIMITED TO LOSS OF DATA, LOSS OF REVENUE, SECURITY BREACHES, OR DAMAGES
CAUSED BY INCORRECT INTEGRATION.

---

## 6. No Affiliation

This SDK is an open-source project maintained by the XRPMEMES community. It
is **not** affiliated with, endorsed by, or in any way connected to:

- Ripple Labs Inc.
- The XRP Ledger Foundation
- Any exchange, custodian, or financial institution

---

## 7. Prohibited Uses

This SDK **must not** be used to:

- Impersonate a legitimate "Sign In With XRPM" flow to phish users.
- Deceive users about the domain or identity requesting authentication.
- Bypass, circumvent, or undermine the security properties of the protocol.
- Facilitate any form of fraud, theft, or unauthorized access.
- Collect wallet addresses without the user's informed consent.

Misuse of this SDK may violate applicable laws and is grounds for removal
from any official partner listing. The XRPMEMES project reserves the right
to publicly disclose abusive integrations.

---

## 8. Open Source Use

This SDK is released under the [MIT License](./LICENSE). You may use,
modify, and distribute it freely under those terms. Contributions are
welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

If you discover a security vulnerability, please report it responsibly via
[SECURITY.md](./SECURITY.md) before public disclosure.

---

*Last updated: 2026-02-26 — Protocol version: XRPM_LOGIN_V1*
