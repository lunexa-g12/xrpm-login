import { xrplRpc, XrplRpcOptions } from './xrplClient';

interface AccountInfoResult {
  account_data?: { Account: string };
  error?: string;
}

/**
 * Check that an XRPL account is activated (i.e. funded above the reserve).
 *
 * An unactivated account cannot hold trust lines and therefore cannot hold XRPM.
 * We check this separately so partners can show a clear "wallet not activated" error.
 *
 * @returns true if the account exists on the ledger
 * @throws Error if the XRPL RPC call fails
 */
export async function checkActivated(
  address: string,
  opts: XrplRpcOptions = {},
): Promise<boolean> {
  const result = await xrplRpc<AccountInfoResult>(
    'account_info',
    { account: address, ledger_index: 'validated' },
    opts,
  );

  // XRPL returns error: "actNotFound" for unactivated accounts
  if (result.error === 'actNotFound') return false;
  return !!result.account_data;
}
