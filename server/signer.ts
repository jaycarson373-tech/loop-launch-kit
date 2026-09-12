import { runtime } from './env';
import { assert } from './http';
import { validAddress } from '../lib/launch';
export async function signerRequest(path: string, body: unknown) {
  const e = runtime();
  assert(
    e.LOOP_SIGNER_URL && e.LOOP_SIGNER_TOKEN,
    503,
    'The managed signing service is not configured.',
  );
  const url = new URL(path, e.LOOP_SIGNER_URL);
  assert(url.protocol === 'https:', 503, 'Signing service must use HTTPS.');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${e.LOOP_SIGNER_TOKEN}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  assert(
    response.ok,
    503,
    'The signing service could not complete the request.',
  );
  return response.json() as Promise<Record<string, string>>;
}
export async function provisionCreator(launchId: string, payout: string) {
  const result = await signerRequest('/v1/wallets', { launchId, payout });
  assert(
    validAddress(result.address),
    503,
    'Signing service returned an invalid public address.',
  );
  return result.address;
}
export async function signJob(
  launchId: string,
  address: string,
  transaction: string,
) {
  const result = await signerRequest('/v1/sign', {
    launchId,
    address,
    transaction,
  });
  assert(
    typeof result.signedTransaction === 'string',
    503,
    'Signing service did not return a transaction.',
  );
  return result.signedTransaction;
}
