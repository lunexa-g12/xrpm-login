<?php

declare(strict_types=1);

namespace XrpmLogin;

/**
 * XRPM_LOGIN_V1 locked constants.
 * Do not change these — they are part of the protocol spec.
 */
final class Constants
{
    /** XRPM currency code on the XRP Ledger (hex-encoded). */
    public const XRPM_CURRENCY = '5852504D00000000000000000000000000000000';

    /** XRPM token issuer address. */
    public const XRPM_ISSUER = 'r9mZNnos1GLtc55tkmr21G9BgXxV7w9hT1';

    /** Minimum XRPM balance required for authentication. */
    public const XRPM_MIN_BALANCE = 10.0;

    /** Public XRPL HTTP cluster endpoint. */
    public const XRPL_ENDPOINT = 'https://xrplcluster.com';

    /** Deep link scheme for the XRPM mobile app. */
    public const DEEP_LINK_SCHEME = 'xrpm://signin';

    /** Protocol version identifier — first line of canonical message. */
    public const PROTOCOL_VERSION = 'XRPM_LOGIN_V1';

    /** Maximum allowed TTL for a challenge (seconds). */
    public const MAX_TTL = 3600;

    /** XRPL base58 alphabet (custom — differs from Bitcoin). */
    public const BASE58_ALPHABET = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz';
}
