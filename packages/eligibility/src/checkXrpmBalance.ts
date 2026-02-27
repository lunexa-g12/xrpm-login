import { xrplRpc, XrplRpcOptions, XRPM_CURRENCY, XRPM_ISSUER, XRPM_MIN_BALANCE } from './xrplClient';

interface TrustLine {
  currency: string;
  balance: string;
  account: string;
}

interface AccountLinesResult {
  lines?: TrustLine[];
  error?: string;
}

export interface XrpmBalanceResult {
  /** Raw balance string from the XRPL trust line (e.g. "42.5"). "0" if no trust line. */
  balance: string;
  /** Whether the balance meets the minimum requirement. */
  meetsMinimum: boolean;
}

/**
 * Check the XRPM trust line balance for an XRPL address.
 *
 * Queries account_lines filtered to the XRPM issuer.
 * Returns balance "0" if the account has no XRPM trust line.
 *
 * @param minBalance - Minimum required balance. Defaults to XRPM_MIN_BALANCE (10).
 * @throws Error if the XRPL RPC call fails
 */
export async function checkXrpmBalance(
  address: string,
  opts: XrplRpcOptions = {},
  minBalance: number = XRPM_MIN_BALANCE,
): Promise<XrpmBalanceResult> {
  const result = await xrplRpc<AccountLinesResult>(
    'account_lines',
    {
      account: address,
      peer: XRPM_ISSUER,
      ledger_index: 'validated',
    },
    opts,
  );

  const lines = result.lines ?? [];
  const xrpmLine = lines.find((l) => l.currency === XRPM_CURRENCY);
  const balance = xrpmLine?.balance ?? '0';

  return {
    balance,
    meetsMinimum: parseFloat(balance) >= minBalance,
  };
}
