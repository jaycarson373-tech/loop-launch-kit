import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validAddress, validHttps, validatePlan } from '../lib/launch.ts';
void test('validates 32-byte base58 addresses', () => {
  assert.equal(
    validAddress('So11111111111111111111111111111111111111112'),
    true,
  );
  assert.equal(validAddress('bad-address'), false);
  assert.equal(validAddress('z'.repeat(44)), false);
});
void test('accepts HTTPS project links and rejects active schemes', () => {
  assert.equal(validHttps('https://example.com/project'), true);
  for (const s of [
    'javascript:alert(1)',
    'http://example.com',
    'https://user:pass@example.com',
  ])
    assert.equal(validHttps(s), false);
});
void test('token plans reject invalid identity and payout', () => {
  assert.throws(() => validatePlan({ name: '', symbol: 'LOOP' }));
  assert.throws(() =>
    validatePlan({ name: 'Loop', symbol: 'LOOP', payout: 'not a wallet' }),
  );
  assert.throws(() =>
    validatePlan({
      name: 'Loop',
      symbol: 'LOOP',
      image: 'data:text/html;base64,eA==',
    }),
  );
  assert.doesNotThrow(() =>
    validatePlan({
      name: 'Loop',
      symbol: 'LOOP',
      description: 'Test',
      payout: '',
    }),
  );
});
