/**
 * Pending session store — links a challenge_id on the laptop side
 * to the verified proof result that arrives on the phone side.
 *
 * Flow:
 *   1. Laptop calls /api/auth/start  → server creates entry: pending[id] = null
 *   2. Phone  calls /api/auth/callback → server sets pending[id] = { address, balance }
 *   3. Laptop polls /api/auth/poll?challenge_id=id → server returns the result
 *
 * In production replace this with Redis:
 *   await redis.set(`pending:${id}`, JSON.stringify(result), 'EX', 300)
 *   const raw = await redis.get(`pending:${id}`)
 */

interface PendingEntry {
  /** null = waiting, object = verified */
  result: { address: string; balance: string } | null;
  /** unix timestamp when this entry expires */
  exp: number;
}

class PendingSessionStore {
  private store = new Map<string, PendingEntry>();

  /** Called by /api/auth/start — reserves a slot for this challenge. */
  create(challengeId: string, ttlSeconds: number): void {
    this.purge();
    this.store.set(challengeId, {
      result: null,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    });
  }

  /** Called by /api/auth/callback (phone side) — stores the verified result. */
  resolve(challengeId: string, address: string, balance: string): boolean {
    const entry = this.store.get(challengeId);
    if (!entry || entry.exp <= Math.floor(Date.now() / 1000)) return false;
    entry.result = { address, balance };
    return true;
  }

  /**
   * Called by /api/auth/poll (laptop side).
   * Returns the result and removes the entry (one-time use).
   */
  consume(challengeId: string): { address: string; balance: string } | null | undefined {
    const entry = this.store.get(challengeId);
    if (!entry || entry.exp <= Math.floor(Date.now() / 1000)) return undefined; // not found / expired

    if (!entry.result) return null; // still waiting

    this.store.delete(challengeId); // consumed
    return entry.result;
  }

  private purge(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [id, entry] of this.store) {
      if (entry.exp <= now) this.store.delete(id);
    }
  }
}

// Singleton shared across all API routes in the same process
export const pendingStore = new PendingSessionStore();
