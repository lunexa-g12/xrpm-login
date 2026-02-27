import { decodeProof } from '@xrpm-login/verifier';
import type { Proof } from '@xrpm-login/verifier';

export interface CallbackParams {
  proof: Proof;
  state?: string;
}

/**
 * Parse and decode the query parameters from the XRPM app's callback redirect.
 *
 * The XRPM app redirects to:
 *   <redirect_uri>?proof=<base64url_proof_json>[&state=<state>]
 *
 * Call this at the top of your callback handler before running verifyLogin().
 * It decodes and validates the proof structure but does NOT verify the signature.
 *
 * @param query  - The raw query string or URLSearchParams from the callback URL
 * @throws XrpmVerifyError if the proof is missing or malformed
 *
 * @example
 * // Express
 * const { proof, state } = parseCallback(req.query);
 *
 * // Next.js App Router
 * const { proof, state } = parseCallback(new URL(request.url).searchParams);
 */
export function parseCallback(query: Record<string, string | string[] | undefined> | URLSearchParams): CallbackParams {
  let proofParam: string | undefined;
  let stateParam: string | undefined;

  if (query instanceof URLSearchParams) {
    proofParam = query.get('proof') ?? undefined;
    stateParam = query.get('state') ?? undefined;
  } else {
    const raw = query['proof'];
    proofParam = Array.isArray(raw) ? raw[0] : raw;
    const rawState = query['state'];
    stateParam = Array.isArray(rawState) ? rawState[0] : rawState;
  }

  if (!proofParam) {
    throw new Error('Missing proof parameter in callback URL');
  }

  const proof = decodeProof(proofParam);

  return { proof, ...(stateParam !== undefined && { state: stateParam }) };
}
