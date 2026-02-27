# Contributing to Sign In With XRPM

Thank you for helping make XRPM authentication safer and easier for partners.

---

## Before You Start

- Read the [DISCLAIMER](./DISCLAIMER.md) and [SECURITY Policy](./SECURITY.md).
- For **security vulnerabilities**, email security@xrpmemes.net — do NOT open
  a public issue.
- For **protocol changes**, open a discussion first. The XRPM_LOGIN_V1
  protocol is locked; breaking changes require a new version.

---

## Development Setup

```bash
# Requires Node >= 18, pnpm >= 9
pnpm install
pnpm build
```

---

## Pull Request Guidelines

1. **One concern per PR.** Keep changes focused.
2. **Tests required.** New behaviour must have tests. Bug fixes must include
   a regression test.
3. **No breaking changes** to the public API without a major version bump and
   prior discussion.
4. **Update the spec** (`spec/`) if your change affects the protocol.
5. Sign your commits with `git commit -s` (Developer Certificate of Origin).

---

## Code Standards

- TypeScript strict mode — no `any`, no `as unknown as X` hacks.
- Errors must be typed (use the error classes in `packages/verifier/src/errors.ts`).
- No `console.log` in library code — use the caller's logger or throw.
- All public functions must have JSDoc comments.

---

## What We Will Not Accept

- Changes that weaken the cryptographic verification pipeline.
- Dependencies with known CVEs or unclear provenance.
- Code that logs, transmits, or stores private keys or raw proofs.
- Features that introduce a centralised XRPMEMES server into the
  direct verification path.
