/**
 * Nonce store for the demo app.
 *
 * Uses MemoryNonceStore for simplicity.
 * In production use RedisNonceStore or PostgresNonceStore.
 */
import { MemoryNonceStore } from '@xrpm-login/sdk-web';

// Singleton — shared across all API route invocations in the same process
export const nonceStore = new MemoryNonceStore();
