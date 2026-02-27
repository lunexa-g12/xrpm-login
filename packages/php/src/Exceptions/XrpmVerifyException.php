<?php

declare(strict_types=1);

namespace XrpmLogin\Exceptions;

/**
 * Thrown by Verifier::verify() on any verification failure.
 *
 * Use $e->getCode() to branch on the failure reason without string matching.
 */
class XrpmVerifyException extends \RuntimeException
{
    // Error code constants — mirrors the TypeScript SDK error codes
    public const INVALID_PROOF_ENCODING  = 'INVALID_PROOF_ENCODING';
    public const INVALID_PROOF_SCHEMA    = 'INVALID_PROOF_SCHEMA';
    public const UNSUPPORTED_VERSION     = 'UNSUPPORTED_VERSION';
    public const AUD_MISMATCH            = 'AUD_MISMATCH';
    public const PROOF_EXPIRED           = 'PROOF_EXPIRED';
    public const NONCE_ALREADY_USED      = 'NONCE_ALREADY_USED';
    public const INVALID_SIGNATURE       = 'INVALID_SIGNATURE';
    public const ALG_KEY_MISMATCH        = 'ALG_KEY_MISMATCH';
    public const ADDRESS_PUBKEY_MISMATCH = 'ADDRESS_PUBKEY_MISMATCH';
    public const INVALID_PUBKEY          = 'INVALID_PUBKEY';
    public const ACCOUNT_NOT_ACTIVATED   = 'ACCOUNT_NOT_ACTIVATED';
    public const INSUFFICIENT_XRPM      = 'INSUFFICIENT_XRPM';
    public const XRPL_UNAVAILABLE        = 'XRPL_UNAVAILABLE';

    private string $errorCode;

    public function __construct(string $errorCode, string $detail = '')
    {
        $this->errorCode = $errorCode;
        parent::__construct($detail ? "{$errorCode}: {$detail}" : $errorCode);
    }

    public function getErrorCode(): string
    {
        return $this->errorCode;
    }
}
