import { address, getAddressEncoder, isAddress } from '@solana/kit';
export const CHALLENGE_SECONDS = 300;
export const CHALLENGE_COOKIE = 'loop_login_challenge';
export function loginMessage(
  origin: string,
  wallet: string,
  chain: string,
  nonce: string,
  now: number,
) {
  return `${new URL(origin).host} wants you to sign in with your Solana account:\n${wallet}\n\nSign in to Loop Finance. This does not authorize a transaction or move funds.\n\nURI: ${origin}\nVersion: 1\nChain ID: ${chain}\nNonce: ${nonce}\nIssued At: ${new Date(now).toISOString()}\nExpiration Time: ${new Date(now + CHALLENGE_SECONDS * 1000).toISOString()}`;
}
export async function verifyWalletMessage(
  wallet: string,
  message: string,
  signature: string,
) {
  if (!isAddress(wallet) || !/^[0-9a-f]{128}$/.test(signature)) return false;
  try {
    const bytes = new Uint8Array(getAddressEncoder().encode(address(wallet)));
    const key = await crypto.subtle.importKey(
      'raw',
      bytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      Uint8Array.from(signature.match(/../g)!, (value) => parseInt(value, 16)),
      new TextEncoder().encode(message),
    );
  } catch {
    return false;
  }
}
export async function verifierHash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
