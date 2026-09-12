import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  executionConfig,
  keeperIsRecent,
  type ExecutionSettings,
} from '../lib/runtime-config.ts';
const configured: ExecutionSettings = {
  LOOP_CLUSTER: 'devnet',
  LOOP_RPC_URL: 'https://api.devnet.solana.com',
  LOOP_TREASURY_ADDRESS: 'So11111111111111111111111111111111111111112',
  LOOP_SIGNER_URL: 'https://signer.example.com',
  LOOP_SIGNER_TOKEN: 's'.repeat(32),
  LOOP_KEEPER_TOKEN: 'k'.repeat(32),
};
void test('execution stays paused even when all credentials are present', () => {
  const c = executionConfig(configured);
  assert.equal(c.configured, true);
  assert.equal(c.launchEnabled, false);
  assert.equal(c.automationEnabled, false);
});
void test('invalid network, insecure endpoints, weak tokens and malformed addresses fail closed', () => {
  for (const patch of [
    { LOOP_CLUSTER: 'mainnet' },
    { LOOP_RPC_URL: 'http://rpc.example.com' },
    { LOOP_SIGNER_URL: 'https://user:password@signer.example.com' },
    { LOOP_TREASURY_ADDRESS: 'wrong' },
    { LOOP_SIGNER_TOKEN: 'short' },
    { LOOP_KEEPER_TOKEN: 's'.repeat(32) },
  ])
    assert.equal(
      executionConfig({
        ...configured,
        ...patch,
        LOOP_EXECUTION_ENABLED: 'true',
      }).launchEnabled,
      false,
    );
});
void test('mainnet requires explicit cluster permission as well as execution enablement', () => {
  assert.equal(
    executionConfig({
      ...configured,
      LOOP_CLUSTER: 'mainnet-beta',
      LOOP_EXECUTION_ENABLED: 'true',
    }).launchEnabled,
    false,
  );
  assert.equal(
    executionConfig({
      ...configured,
      LOOP_CLUSTER: 'mainnet-beta',
      LOOP_EXECUTION_ENABLED: 'true',
      LOOP_ALLOW_MAINNET: 'true',
    }).launchEnabled,
    true,
  );
});
void test('keeper timestamps must be present, recent and not in the future', () => {
  assert.equal(keeperIsRecent(null, 100000), false);
  assert.equal(keeperIsRecent(10000, 100000), true);
  assert.equal(keeperIsRecent(9999, 100000), false);
  assert.equal(keeperIsRecent(100001, 100000), false);
});
