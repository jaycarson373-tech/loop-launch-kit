import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BuybackEngine } from '../lib/buybacks.ts';
void test('persisted checkpoints reject malformed nested records without mutation', () => {
  const checkpoint = new BuybackEngine().checkpoint();
  for (const patch of [
    { held: -1 },
    { lastPrice: '1' },
    { observations: [null] },
    { lots: [null] },
    { receipts: [1] },
    { lastPriceAt: '100' },
  ])
    assert.throws(() => BuybackEngine.restore({ ...checkpoint, ...patch }));
  assert.deepEqual(BuybackEngine.restore(checkpoint).checkpoint(), checkpoint);
});
