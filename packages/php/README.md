# xrpmemes/xrpm-login (PHP)

PHP package for **Sign In With XRPM** — server-side challenge creation and proof verification.

## Requirements

- PHP ≥ 8.1
- `ext-sodium` (for ed25519)
- `ext-curl`, `ext-json`
- `ext-gmp` (for address derivation)
- [`simplito/elliptic-php`](https://github.com/simplito/elliptic-php) (for secp256k1)

## Install

```bash
composer require xrpmemes/xrpm-login
```

## Usage

### Challenge creation

```php
<?php
use XrpmLogin\Challenge;

// Creates a challenge and returns the deep link for the XRPM app
$result    = Challenge::create('https://mysite.com', 'https://mysite.com/auth/callback');
$deepLink  = $result['deepLink'];        // open on mobile or encode as QR
$challengeId = $result['challenge']['nonce'];  // use for cross-device polling
```

### Proof verification

```php
<?php
use XrpmLogin\Verifier;
use XrpmLogin\NonceStore\PdoNonceStore;
use XrpmLogin\Exceptions\XrpmVerifyException;

// Production: PDO (MySQL / PostgreSQL / SQLite)
$nonceStore = new PdoNonceStore($pdo);

// Or Redis
// use XrpmLogin\NonceStore\RedisNonceStore;
// $nonceStore = new RedisNonceStore($redis);

$verifier = new Verifier($nonceStore);

try {
    $data = $verifier->verify($_GET['proof'], [
        'expectedAud'         => 'https://mysite.com',
        'expectedRedirectUri' => 'https://mysite.com/auth/callback',
        'checkXRPM'           => true,   // default
    ]);
    $_SESSION['address'] = $data['address'];  // authenticated XRPL wallet
    $_SESSION['balance'] = $data['balance'];  // XRPM balance at login time
    header('Location: /dashboard');
} catch (XrpmVerifyException $e) {
    header('Location: /?error=' . $e->getErrorCode());
}
```

## Nonce Stores

| Class | Description |
|-------|-------------|
| `ArrayNonceStore` | In-memory. Development / single-request only. |
| `PdoNonceStore` | MySQL, PostgreSQL, or SQLite via PDO. |
| `RedisNonceStore` | Works with `ext-redis` or Predis. |

### PDO setup

```sql
CREATE TABLE xrpm_nonces (
    nonce      VARCHAR(128) PRIMARY KEY,
    expires_at BIGINT NOT NULL
);
```

## Error Codes

`XrpmVerifyException::getErrorCode()` returns one of:

`INVALID_PROOF_ENCODING`, `INVALID_PROOF_SCHEMA`, `UNSUPPORTED_VERSION`,
`AUD_MISMATCH`, `PROOF_EXPIRED`, `NONCE_ALREADY_USED`, `INVALID_SIGNATURE`,
`ADDRESS_MISMATCH`, `ACCOUNT_NOT_ACTIVATED`, `INSUFFICIENT_XRPM`, `XRPL_UNAVAILABLE`

---

MIT License — see [DISCLAIMER](../../DISCLAIMER.md) before integrating.
