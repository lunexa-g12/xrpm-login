/**
 * @xrpm-login/eligibility
 *
 * Checks whether an XRPL account is eligible to use "Sign In With XRPM".
 *
 * Eligibility requires:
 *   1. Account is activated on the XRP Ledger (funded above reserve).
 *   2. Account holds at least `minXrpmBalance` XRPM tokens (default 10).
 *      Set minXrpmBalance to 0 for wallet-ownership-only mode (no balance check).
 *
 * This package makes two XRPL HTTP JSON-RPC calls per check (one when minXrpmBalance=0).
 * You can point it at your own XRPL node via the `endpoint` option.
 *
 * @see https://github.com/xrpmemes/xrpm-login/spec/XRPM_LOGIN_V1.md
 */

import { checkActivated } from './checkActivated';
import { checkXrpmBalance } from './checkXrpmBalance';
import {
  XRPM_CURRENCY,
  XRPM_ISSUER,
  XRPM_MIN_BALANCE,
  XRPL_ENDPOINT,
  type XrplRpcOptions,
} from './xrplClient';

export { checkActivated };
export { checkXrpmBalance };
export type { XrpmBalanceResult } from './checkXrpmBalance';
export { XRPM_CURRENCY, XRPM_ISSUER, XRPM_MIN_BALANCE, XRPL_ENDPOINT };
export type { XrplRpcOptions };

export interface EligibilityResult {
  /** Whether the account passes all eligibility checks. */
  eligible: boolean;
  /** Whether the account is activated on the ledger. */
  activated: boolean;
  /**
   * Raw XRPM balance string from the trust line.
   * "0" if no trust line. "unchecked" when minXrpmBalance is 0.
   */
  balance: string;
  /** Human-readable reason if not eligible. */
  reason?: string;
}

export interface EligibilityOptions extends XrplRpcOptions {
  /**
   * Minimum XRPM balance required.
   *   - Default: 10 (the standard XRPM_MIN_BALANCE)
   *   - Set to 0 for wallet-ownership-only mode: only account activation is
   *     checked; no XRPM balance query is made.
   *   - Any positive number: balance must be ≥ that value.
   */
  minXrpmBalance?: number;
}

/**
 * Full eligibility check: activation + XRPM balance.
 *
 * This is what the partner server calls after verifying the cryptographic proof.
 * The XRPM app also runs this check, but that check is for UX only.
 * **Always re-verify server-side.**
 *
 * @example
 * // Default (10 XRPM required)
 * const result = await checkEligibility('rXXXX...');
 *
 * @example
 * // Wallet-ownership-only (no XRPM required)
 * const result = await checkEligibility('rXXXX...', { minXrpmBalance: 0 });
 *
 * @example
 * // Custom threshold
 * const result = await checkEligibility('rXXXX...', { minXrpmBalance: 50 });
 */
export async function checkEligibility(
  address: string,
  opts: EligibilityOptions = {},
): Promise<EligibilityResult> {
  const minBalance = opts.minXrpmBalance ?? XRPM_MIN_BALANCE;

  if (minBalance === 0) {
    // Wallet-ownership-only mode: skip the XRPM balance query entirely.
    // Only verify the account exists on the ledger.
    const activated = await checkActivated(address, opts);
    return activated
      ? { eligible: true,  activated: true,  balance: 'unchecked' }
      : { eligible: false, activated: false, balance: 'unchecked', reason: 'ACCOUNT_NOT_ACTIVATED' };
  }

  // Standard mode: check activation and XRPM balance in parallel.
  const [activated, { balance, meetsMinimum }] = await Promise.all([
    checkActivated(address, opts),
    checkXrpmBalance(address, opts, minBalance),
  ]);

  if (!activated) {
    return { eligible: false, activated: false, balance, reason: 'ACCOUNT_NOT_ACTIVATED' };
  }
  if (!meetsMinimum) {
    return {
      eligible: false,
      activated: true,
      balance,
      reason: `INSUFFICIENT_XRPM: balance ${balance} < required ${minBalance}`,
    };
  }

  return { eligible: true, activated: true, balance };
}
