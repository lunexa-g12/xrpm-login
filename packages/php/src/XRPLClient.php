<?php

declare(strict_types=1);

namespace XrpmLogin;

use XrpmLogin\Exceptions\XrpmVerifyException;

/**
 * Lightweight XRPL HTTP JSON-RPC client.
 * Uses ext-curl — no external HTTP library required.
 */
class XRPLClient
{
    public function __construct(
        private readonly string $endpoint  = Constants::XRPL_ENDPOINT,
        private readonly int    $timeoutMs = 10_000,
    ) {}

    /**
     * Check whether an account is activated (exists on the validated ledger).
     */
    public function checkActivated(string $address): bool
    {
        $result = $this->rpc('account_info', [
            'account'       => $address,
            'ledger_index'  => 'validated',
        ]);

        // XRPL returns error: "actNotFound" for unactivated accounts
        if (isset($result['error']) && $result['error'] === 'actNotFound') {
            return false;
        }
        return isset($result['account_data']);
    }

    /**
     * Return the XRPM balance for an address.
     * Returns '0' if no XRPM trust line exists.
     *
     * @throws XrpmVerifyException XRPL_UNAVAILABLE on network failure
     */
    public function getXrpmBalance(string $address): string
    {
        $result = $this->rpc('account_lines', [
            'account'      => $address,
            'peer'         => Constants::XRPM_ISSUER,
            'ledger_index' => 'validated',
        ]);

        $lines = $result['lines'] ?? [];
        foreach ($lines as $line) {
            if (($line['currency'] ?? '') === Constants::XRPM_CURRENCY) {
                return (string) $line['balance'];
            }
        }

        return '0';
    }

    /**
     * Send a JSON-RPC request to the XRPL HTTP endpoint.
     *
     * @throws XrpmVerifyException XRPL_UNAVAILABLE on any network/HTTP error
     */
    private function rpc(string $method, array $params): array
    {
        $body = json_encode(['method' => $method, 'params' => [$params]]);

        $ch = curl_init($this->endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT_MS     => $this->timeoutMs,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($response === false || $error) {
            throw new XrpmVerifyException(XrpmVerifyException::XRPL_UNAVAILABLE, $error);
        }
        if ($httpCode !== 200) {
            throw new XrpmVerifyException(
                XrpmVerifyException::XRPL_UNAVAILABLE,
                "HTTP {$httpCode}",
            );
        }

        $data = json_decode($response, true);
        if (!isset($data['result'])) {
            throw new XrpmVerifyException(XrpmVerifyException::XRPL_UNAVAILABLE, 'no result');
        }

        return $data['result'];
    }
}
