import { platformRuntime } from './platform';
import type { Database, ArtworkStore } from './contracts';
import { executionConfig } from '../lib/runtime-config';
export type LoopEnv = {
  DB: Database;
  ASSETS: ArtworkStore;
  AUTH_MODE: 'sites' | 'password';
  LOOP_ADMIN_PASSWORD?: string;
  LOOP_SESSION_SECRET?: string;
  TURSO_DATABASE_URL?: string;
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
  LOOP_EXECUTION_ENABLED?: string;
};
export function runtime() {
  return platformRuntime();
}
export function config() {
  return executionConfig(runtime());
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
