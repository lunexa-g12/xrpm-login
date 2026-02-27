<?php

declare(strict_types=1);

namespace XrpmLogin;

/**
 * Generates XRPM_LOGIN_V1 challenges.
 *
 * @example
 *   $result = Challenge::create([
 *       'aud'          => 'https://mysite.com',
 *       'redirect_uri' => 'https://mysite.com/auth/callback',
 *       'client_id'    => 'mysite.com',
 *       'ttl'          => 300,
 *   ]);
 *
 *   $_SESSION['xrpm_nonce'] = $result['challenge']['nonce']; // store for replay prevention
 *   $deepLink = $result['deep_link'];                        // show as QR or button
 */
class Challenge
{
    /**
     * @param array{
     *   aud: string,
     *   redirect_uri: string,
     *   client_id: string,
     *   ttl?: int,
     *   state?: string,
     * } $options
     *
     * @return array{
     *   challenge: array{v:int, aud:string, nonce:string, iat:int, exp:int, client_id:string, redirect_uri:string, state?:string},
     *   deep_link: string,
     * }
     *
     * @throws \InvalidArgumentException if aud or redirect_uri are not HTTPS
     */
    public static function create(array $options): array
    {
        $aud         = $options['aud'] ?? '';
        $redirectUri = $options['redirect_uri'] ?? '';
        $clientId    = $options['client_id'] ?? '';
        $ttl         = min((int) ($options['ttl'] ?? 300), Constants::MAX_TTL);
        $state       = $options['state'] ?? null;

        // Security: both URLs must be HTTPS
        if (!str_starts_with($aud, 'https://')) {
            throw new \InvalidArgumentException('aud must be an HTTPS URL');
        }
        if (!str_starts_with($redirectUri, 'https://')) {
            throw new \InvalidArgumentException('redirect_uri must be an HTTPS URL');
        }

        // Security: redirect_uri must share same origin as aud (open redirect prevention)
        $audParsed      = parse_url($aud);
        $redirectParsed = parse_url($redirectUri);
        $audOrigin      = ($audParsed['scheme'] ?? '') . '://' . ($audParsed['host'] ?? '');
        $redirectOrigin = ($redirectParsed['scheme'] ?? '') . '://' . ($redirectParsed['host'] ?? '');
        if ($audOrigin !== $redirectOrigin) {
            throw new \InvalidArgumentException('redirect_uri must share the same origin as aud');
        }

        $now   = time();
        $nonce = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '='); // base64url 32 bytes

        $challenge = array_filter([
            'v'            => 1,
            'aud'          => $aud,
            'nonce'        => $nonce,
            'iat'          => $now,
            'exp'          => $now + $ttl,
            'client_id'    => $clientId,
            'redirect_uri' => $redirectUri,
            'state'        => $state,
        ], fn($v) => $v !== null);

        $encoded  = rtrim(strtr(base64_encode(json_encode($challenge)), '+/', '-_'), '=');
        $deepLink = Constants::DEEP_LINK_SCHEME . '?req=' . $encoded;

        return ['challenge' => $challenge, 'deep_link' => $deepLink];
    }
}
