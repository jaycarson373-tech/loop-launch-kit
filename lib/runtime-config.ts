import { validAddress, validHttps } from './launch.ts';
export type ExecutionSettings = Partial<
  Record<
    | 'LOOP_RPC_URL'
    | 'LOOP_CLUSTER'
    | 'LOOP_TREASURY_ADDRESS'
    | 'LOOP_MAIN_MINT'
    | 'LOOP_SIGNER_URL'
    | 'LOOP_SIGNER_TOKEN'
    | 'LOOP_KEEPER_TOKEN'
    | 'LOOP_ALLOW_MAINNET'
    | 'LOOP_EXECUTION_ENABLED',
    string
  >
>;
export function executionConfig(e: ExecutionSettings) {
  const cluster = e.LOOP_CLUSTER === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';
  const required = [
    'LOOP_RPC_URL',
    'LOOP_TREASURY_ADDRESS',
    'LOOP_SIGNER_URL',
    'LOOP_SIGNER_TOKEN',
    'LOOP_KEEPER_TOKEN',
  ] as const;
  const missing: string[] = required.filter((k) => !e[k]?.trim());
  const invalid: string[] = [];
  if (e.LOOP_CLUSTER && !['devnet', 'mainnet-beta'].includes(e.LOOP_CLUSTER))
    invalid.push('LOOP_CLUSTER');
  for (const k of ['LOOP_RPC_URL', 'LOOP_SIGNER_URL'] as const)
    if (e[k] && !validHttps(e[k]!)) invalid.push(k);
  for (const k of ['LOOP_TREASURY_ADDRESS', 'LOOP_MAIN_MINT'] as const)
    if (e[k] && !validAddress(e[k]!)) invalid.push(k);
  for (const k of ['LOOP_SIGNER_TOKEN', 'LOOP_KEEPER_TOKEN'] as const)
    if (e[k] && e[k]!.length < 32) invalid.push(k);
  if (e.LOOP_SIGNER_TOKEN && e.LOOP_SIGNER_TOKEN === e.LOOP_KEEPER_TOKEN)
    invalid.push('Separate signer and keeper tokens required');
  if (cluster === 'mainnet-beta' && e.LOOP_ALLOW_MAINNET !== 'true')
    missing.push('LOOP_ALLOW_MAINNET');
  const configured = missing.length === 0 && invalid.length === 0,
    enabled = configured && e.LOOP_EXECUTION_ENABLED === 'true';
  return {
    cluster,
    chain: cluster === 'mainnet-beta' ? 'solana:mainnet' : 'solana:devnet',
    treasury: e.LOOP_TREASURY_ADDRESS || null,
    mainMint: e.LOOP_MAIN_MINT || null,
    configured,
    launchEnabled: enabled,
    automationEnabled: enabled,
    paused: e.LOOP_EXECUTION_ENABLED !== 'true',
    missing,
    invalid,
  };
}
export const KEEPER_MAX_AGE_MS = 90_000;
export function keeperIsRecent(at: unknown, now = Date.now()) {
  return (
    typeof at === 'number' &&
    Number.isFinite(at) &&
    at <= now &&
    now - at <= KEEPER_MAX_AGE_MS
  );
}
