/** XRPM token constants (locked per spec) */
export const XRPM_CURRENCY = '5852504D00000000000000000000000000000000';
export const XRPM_ISSUER   = 'r9mZNnos1GLtc55tkmr21G9BgXxV7w9hT1';
export const XRPM_MIN_BALANCE = 10;
export const XRPL_ENDPOINT = 'https://xrplcluster.com';

export interface XrplRpcOptions {
  /** Override the XRPL endpoint (e.g. for a private node). Default: xrplcluster.com */
  endpoint?: string;
  /** Request timeout in milliseconds. Default: 10000 */
  timeoutMs?: number;
}

/**
 * Send a JSON-RPC request to the XRPL HTTP API.
 * Uses the native fetch API (Node >= 18).
 *
 * @throws Error if the network request fails or times out
 */
export async function xrplRpc<T>(
  method: string,
  params: object,
  opts: XrplRpcOptions = {},
): Promise<T> {
  const endpoint = opts.endpoint ?? XRPL_ENDPOINT;
  const timeoutMs = opts.timeoutMs ?? 10_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params: [params] }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(`XRPL RPC network error: ${String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`XRPL RPC HTTP error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { result: T };
  return data.result;
}
