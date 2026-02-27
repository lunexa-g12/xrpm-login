<?php

declare(strict_types=1);

namespace XrpmLogin\NonceStore;

/**
 * PDO nonce store — production-ready for MySQL, PostgreSQL, or SQLite.
 *
 * Required table (run once in your database):
 *
 *   CREATE TABLE xrpm_nonces (
 *     nonce      VARCHAR(100)  NOT NULL PRIMARY KEY,
 *     expires_at DATETIME      NOT NULL
 *   );
 *
 * Uses INSERT ... (ON DUPLICATE KEY / ON CONFLICT DO NOTHING) for atomicity.
 * Two simultaneous requests with the same nonce cannot both return true.
 *
 * @example
 *   $pdo   = new PDO('mysql:host=localhost;dbname=myapp', $user, $pass);
 *   $store = new PdoNonceStore($pdo);
 */
class PdoNonceStore implements NonceStoreInterface
{
    public function __construct(
        private readonly \PDO $pdo,
        private readonly string $table = 'xrpm_nonces',
    ) {}

    public function consume(string $nonce, int $ttlSeconds): bool
    {
        $expiresAt = date('Y-m-d H:i:s', time() + $ttlSeconds);
        $driver    = $this->pdo->getAttribute(\PDO::ATTR_DRIVER_NAME);

        // Build driver-specific upsert (all atomic on duplicate key)
        $sql = match ($driver) {
            'mysql'  => "INSERT IGNORE INTO {$this->table} (nonce, expires_at) VALUES (?, ?)",
            'pgsql'  => "INSERT INTO {$this->table} (nonce, expires_at) VALUES (?, ?) ON CONFLICT (nonce) DO NOTHING",
            'sqlite' => "INSERT OR IGNORE INTO {$this->table} (nonce, expires_at) VALUES (?, ?)",
            default  => "INSERT INTO {$this->table} (nonce, expires_at) VALUES (?, ?)",
        };

        try {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute([$nonce, $expiresAt]);
            return $stmt->rowCount() > 0; // 1 = inserted (first use), 0 = conflict (replay)
        } catch (\PDOException $e) {
            // Fallback: catch duplicate key for drivers that throw instead of returning rowCount 0
            if (in_array($e->getCode(), ['23000', '23505'], strict: true)) {
                return false;
            }
            throw $e;
        }
    }

    /**
     * Purge expired nonces. Call this from a scheduled job — PDO doesn't auto-expire rows.
     */
    public function purgeExpired(): int
    {
        $stmt = $this->pdo->prepare("DELETE FROM {$this->table} WHERE expires_at <= NOW()");
        $stmt->execute();
        return $stmt->rowCount();
    }
}
