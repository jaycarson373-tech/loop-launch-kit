import { env } from 'cloudflare:workers';
export type LoopEnv = {
  DB: D1Database;
  ASSETS: R2Bucket;
  LOOP_RPC_URL?: string;
  LOOP_CLUSTER?: string;
  LOOP_TREASURY_ADDRESS?: string;
  LOOP_KEEPER_ADDRESS?: string;
  LOOP_MAIN_MINT?: string;
  LOOP_SIGNER_URL?: string;
  LOOP_SIGNER_TOKEN?: string;
  LOOP_KEEPER_TOKEN?: string;
  LOOP_ALLOW_MAINNET?: string;
  LOOP_PUBLIC_ORIGIN?: string;
};
export function runtime() {
  return env as unknown as LoopEnv;
}
export function config() {
  const e = runtime();
  const cluster = e.LOOP_CLUSTER === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';
  const missing = [
    'LOOP_SIGNER_URL',
    'LOOP_SIGNER_TOKEN',
    'LOOP_TREASURY_ADDRESS',
    'LOOP_RPC_URL',
  ].filter((k) => !e[k as keyof LoopEnv]);
  if (cluster === 'mainnet-beta' && e.LOOP_ALLOW_MAINNET !== 'true')
    missing.push('LOOP_ALLOW_MAINNET');
  return {
    cluster,
    chain: cluster === 'mainnet-beta' ? 'solana:mainnet' : 'solana:devnet',
    keeper: e.LOOP_KEEPER_ADDRESS || null,
    treasury: e.LOOP_TREASURY_ADDRESS || null,
    mainMint: e.LOOP_MAIN_MINT || null,
    launchEnabled: missing.length === 0,
    automationEnabled:
      missing.length === 0 &&
      !!e.LOOP_SIGNER_URL &&
      !!e.LOOP_SIGNER_TOKEN &&
      !!e.LOOP_KEEPER_TOKEN,
    missing,
  };
}
export function rpcUrl() {
  const e = runtime();
  return (
    e.LOOP_RPC_URL ||
    (config().cluster === 'mainnet-beta'
      ? 'https://api.mainnet-beta.solana.com'
      : 'https://api.devnet.solana.com')
  );
}
