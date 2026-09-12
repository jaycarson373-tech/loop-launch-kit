import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateFees,
  BuybackEngine,
  LAMPORTS,
  parseSol,
  simulateBuybacks,
} from '../lib/buybacks.ts';
function ready() {
  const e = new BuybackEngine();
  e.creditCreatorFees('r', 10n * LAMPORTS);
  e.observe(100, 0);
  e.observe(50, 1000);
  return e;
}
test('allocations conserve lamports including rounding dust', () => {
  for (const n of [1n, 3n, 999999999n, 50n * LAMPORTS])
    for (const main of [false, true]) {
      const a = allocateFees(n, main);
      assert.equal(a.buyback + a.creator + a.platform, n);
    }
  assert.equal(allocateFees(LAMPORTS, true).buyback, 800000000n);
});
test('reject negative values and malformed SOL', () => {
  assert.throws(() => allocateFees(-1n));
  for (const x of ['NaN', 'Infinity', '-1', '1e3', '1.0000000001'])
    assert.throws(() => parseSol(x));
  assert.equal(parseSol('1.000000001'), 1000000001n);
});
test('fee credits are idempotent', () => {
  const e = ready();
  assert.equal(e.creditCreatorFees('r', 10n * LAMPORTS), false);
  assert.equal(e.creator, LAMPORTS);
});
test('dip threshold boundary releases exactly once', () => {
  const e = new BuybackEngine();
  e.creditCreatorFees('r', LAMPORTS);
  e.observe(100, 0);
  assert.equal(e.observe(50.1, 1000), false);
  assert.equal(e.observe(50, 2000), true);
  assert.equal(e.observe(49, 3000), false);
});
test('new revenue stays held during an active cycle', () => {
  const e = ready();
  e.creditCreatorFees('new', LAMPORTS);
  assert.equal(e.held, 700000000n);
  assert.equal(e.released, 7n * LAMPORTS);
});
test('stale, missing, zero and unordered prices fail closed', () => {
  const e = ready();
  for (const p of [0, -1, NaN, Infinity])
    assert.throws(() => e.observe(p, 2000));
  assert.throws(() => e.observe(10, 0));
  assert.throws(() => e.observe(10, 2000, 40000));
  assert.equal(e.reserveBatch(40000, 5000n).length, 0);
});
test('rolling high expires and does not trigger on old data', () => {
  const e = new BuybackEngine();
  e.creditCreatorFees('r', LAMPORTS);
  e.observe(100, 0);
  assert.equal(e.observe(40, 1200001), false);
});
test('four reservations have two-second spacing and no overlapping batches', () => {
  const e = ready(),
    lots = e.reserveBatch(1000, 5000n);
  assert.equal(lots.length, 4);
  assert.deepEqual(
    lots.map((l) => l.sendAfter),
    [1000, 3000, 5000, 7000],
  );
  assert.equal(e.reserveBatch(9000, 5000n).length, 0);
  assert.equal(
    e.released + lots.reduce((a, l) => a + l.reserved, 0n),
    7n * LAMPORTS,
  );
  assert.equal(e.creator, LAMPORTS);
});
test('uncertain receipt keeps money reserved', () => {
  const e = ready(),
    lots = e.reserveBatch(1000, 5000n);
  const remaining = e.released;
  e.settle(lots[0].id, 'uncertain');
  assert.equal(e.released, remaining);
  assert.equal(e.reserveBatch(2000, 5000n).length, 0);
});
test('successful settlement uses actual debit and is idempotent', () => {
  const e = ready(),
    [l] = e.reserveBatch(1000, 5000n);
  e.attachSignature(l.id, 'verified-test-signature');
  const before = e.released;
  e.settle(l.id, 'confirmed', l.purchase + 1000n, 123n);
  assert.equal(e.released, before + 4000n);
  assert.equal(e.burned, 123n);
  assert.equal(e.settle(l.id, 'confirmed', l.purchase + 1000n, 123n), false);
});
test('failed transaction books fees but no tokens', () => {
  const e = ready(),
    [l] = e.reserveBatch(1000, 5000n);
  e.attachSignature(l.id, 'failed-signature');
  e.settle(l.id, 'failed', 5000n);
  assert.equal(e.spent, 5000n);
  assert.equal(e.burned, 0n);
});
test('over-budget receipt halts without releasing reservation', () => {
  const e = ready(),
    [l] = e.reserveBatch(1000, 5000n);
  e.attachSignature(l.id, 'mismatch');
  const before = e.released;
  assert.throws(() => e.settle(l.id, 'confirmed', l.reserved + 1n, 2n));
  assert.equal(e.halted, true);
  assert.equal(e.released, before);
});
test('dust never borrows payout money', () => {
  const e = new BuybackEngine();
  e.creditCreatorFees('r', 10000n);
  e.observe(100, 0);
  e.observe(30, 1000);
  assert.equal(e.reserveBatch(1000, 5000n).length, 0);
  assert.equal(e.creator, 1000n);
});
test('migration pauses execution and resets reference', () => {
  const e = ready();
  e.migrate('pumpswap');
  assert.equal(e.reserveBatch(1000, 5000n).length, 0);
  e.resumeVerifiedVenue();
  assert.equal(e.reserveBatch(2000, 5000n).length, 0);
  e.observe(50, 3000);
  assert.equal(e.reserveBatch(3000, 5000n).length, 4);
});
test('treasury stream uses half of independently verified net revenue', () => {
  const e = new BuybackEngine();
  e.creditNetPlatformRevenue('net', 2n * LAMPORTS);
  e.creditNetPlatformRevenue('net', 2n * LAMPORTS);
  e.observe(100, 0);
  const [l] = e.reserveBatch(0, 5000n, 'treasury');
  assert.equal(l.purchase, 50000000n);
  e.attachSignature(l.id, 'treasury');
  e.settle(l.id, 'confirmed', l.reserved, 100n);
  e.observe(100, 1000);
  assert.equal(e.reserveBatch(1000, 5000n, 'treasury').length, 0);
  assert.equal(e.creator, 0n);
});
test('simulation returns data and cannot spend', () => {
  const s = simulateBuybacks({ revenue: 10, drop: 55, main: false });
  assert.equal(s.mode, 'simulation');
  assert.equal(s.allocation.buyback, 7);
  assert.equal(s.lots.length, 4);
  assert.throws(() =>
    simulateBuybacks({ revenue: NaN, drop: 50, main: false }),
  );
  assert.equal(
    simulateBuybacks({ revenue: 10, drop: 20, main: false }).lots.length,
    0,
  );
});
