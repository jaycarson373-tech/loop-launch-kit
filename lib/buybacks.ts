import { objectValue, finiteNumber, unsignedAmount } from './json.ts';
/** Loop policy engine. Pure accounting; this module never signs or broadcasts. */
export const LAMPORTS = 1_000_000_000n;
export const POLICY = Object.freeze({
  buybackBps: 7000,
  creatorBps: 1000,
  platformBps: 2000,
  mainBuybackBps: 8000,
  treasuryBuybackBps: 5000,
  dipBps: 5000,
  rearmBps: 8000,
  windowMs: 20 * 60_000,
  maxPriceAgeMs: 30_000,
  lotBps: 250,
  minLot: 50_000_000n,
  maxLot: 1_000_000_000n,
  maxPayout: 100_000_000_000n,
  batchSize: 4,
  spacingMs: 2000,
  treasuryIntervalMs: 60_000,
  slippageBps: 100,
});
const fraction = (n: bigint, bps: number) => (n * BigInt(bps)) / 10_000n;
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);
function amount(n: bigint) {
  if (typeof n !== 'bigint' || n < 0n)
    throw new Error('Amount must be nonnegative lamports');
}
export function parseSol(value: string): bigint {
  if (!/^\d{1,9}(\.\d{1,9})?$/.test(value))
    throw new Error(
      'Enter a nonnegative SOL amount with at most 9 decimal places',
    );
  const [whole, decimal = ''] = value.split('.');
  return BigInt(whole) * LAMPORTS + BigInt(decimal.padEnd(9, '0'));
}
export function sol(n: bigint): number {
  return Number(n) / Number(LAMPORTS);
}
export function allocateFees(total: bigint, main = false) {
  amount(total);
  const buyback = fraction(total, main ? 8000 : 7000),
    creator = main ? 0n : fraction(total, 1000);
  return { buyback, creator, platform: total - buyback - creator };
}
export type Lot = {
  id: string;
  stream: 'dip' | 'treasury';
  purchase: bigint;
  costCeiling: bigint;
  reserved: bigint;
  sendAfter: number;
  status: 'reserved' | 'confirmed' | 'failed' | 'uncertain';
  signature?: string;
};
export class BuybackEngine {
  held = 0n;
  released = 0n;
  creator = 0n;
  platform = 0n;
  operationsDebt = 0n;
  treasuryReady = 0n;
  treasuryCredited = 0n;
  treasurySpent = 0n;
  netPlatformRevenue = 0n;
  spent = 0n;
  burned = 0n;
  cycleLot = 0n;
  armed = true;
  halted = false;
  venue = 'curve';
  lastTreasuryAt = -Infinity;
  lastPriceAt = -Infinity;
  lastPrice = 0;
  receipts = new Set<string>();
  lots: Lot[] = [];
  observations: { price: number; at: number }[] = [];
  creditCreatorFees(receipt: string, total: bigint, main = false) {
    amount(total);
    if (!receipt) throw new Error('Receipt ID required');
    if (this.receipts.has(receipt)) return false;
    const a = allocateFees(total, main);
    this.receipts.add(receipt);
    this.held += a.buyback;
    this.creator += a.creator;
    const repayment = min(a.platform, this.operationsDebt);
    this.operationsDebt -= repayment;
    this.platform += a.platform - repayment;
    return true;
  }
  recordOperationsCost(cost: bigint) {
    amount(cost);
    const paid = min(this.platform, cost);
    this.platform -= paid;
    this.operationsDebt += cost - paid;
  }
  creditNetPlatformRevenue(receipt: string, net: bigint) {
    amount(net);
    if (!receipt) throw new Error('Receipt ID required');
    if (this.receipts.has(receipt)) return false;
    this.receipts.add(receipt);
    this.netPlatformRevenue += net;
    const allocation = fraction(net, POLICY.treasuryBuybackBps);
    this.treasuryCredited += allocation;
    this.treasuryReady += allocation;
    return true;
  }
  observe(price: number, at: number, now = at) {
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(at) ||
      !Number.isFinite(now) ||
      at > now ||
      now - at > POLICY.maxPriceAgeMs ||
      at <= this.lastPriceAt
    )
      throw new Error('Price must be positive, fresh and ordered');
    this.lastPriceAt = at;
    this.lastPrice = price;
    this.observations = this.observations.filter(
      (p) => p.at >= at - POLICY.windowMs,
    );
    this.observations.push({ price, at });
    const high = Math.max(...this.observations.map((p) => p.price));
    const ratio = price / high;
    if (ratio > POLICY.rearmBps / 10000) this.armed = true;
    if (
      !this.halted &&
      this.armed &&
      ratio <= POLICY.dipBps / 10000 &&
      this.released === 0n &&
      !this.pending().some((l) => l.stream === 'dip') &&
      this.held > 0n
    ) {
      this.released = this.held;
      this.held = 0n;
      this.cycleLot = max(
        fraction(this.released, POLICY.lotBps),
        POLICY.minLot,
      );
      this.armed = false;
      return true;
    }
    return false;
  }
  pending() {
    return this.lots.filter(
      (l) => l.status === 'reserved' || l.status === 'uncertain',
    );
  }
  migrate(venue: 'curve' | 'pumpswap') {
    this.venue = venue;
    this.observations = [];
    this.lastPriceAt = -Infinity;
    this.armed = true;
    this.halted = true;
  }
  resumeVerifiedVenue() {
    if (this.pending().length)
      throw new Error('Resolve pending transactions before resuming');
    this.halted = false;
  }
  reserveBatch(
    now: number,
    costCeiling: bigint,
    stream: 'dip' | 'treasury' = 'dip',
  ) {
    amount(costCeiling);
    if (!Number.isFinite(now)) throw new Error('Invalid time');
    if (
      this.halted ||
      this.pending().length ||
      now - this.lastPriceAt > POLICY.maxPriceAgeMs ||
      now < this.lastPriceAt
    )
      return [];
    if (
      stream === 'treasury' &&
      now - this.lastTreasuryAt < POLICY.treasuryIntervalMs
    )
      return [];
    let available = stream === 'dip' ? this.released : this.treasuryReady;
    const fixedLot =
      stream === 'dip'
        ? this.cycleLot
        : max(fraction(available, POLICY.lotBps), POLICY.minLot);
    const batch: Lot[] = [];
    for (let i = 0; i < (stream === 'dip' ? POLICY.batchSize : 1); i++) {
      if (available < POLICY.minLot + costCeiling) break;
      const purchase = min(
        POLICY.maxLot,
        min(fixedLot, available - costCeiling),
      );
      if (purchase < POLICY.minLot) break;
      const reserved = purchase + costCeiling;
      const lot: Lot = {
        id: `lot-${this.lots.length + 1}`,
        stream,
        purchase,
        costCeiling,
        reserved,
        sendAfter: now + i * POLICY.spacingMs,
        status: 'reserved',
      };
      available -= reserved;
      this.lots.push(lot);
      batch.push(lot);
    }
    if (stream === 'dip') {
      this.released = available;
      if (
        !batch.length &&
        available > 0n &&
        available < POLICY.minLot + costCeiling
      ) {
        this.held += available;
        this.released = 0n;
        this.cycleLot = 0n;
      }
    } else {
      this.treasuryReady = available;
      if (batch.length) this.lastTreasuryAt = now;
    }
    return batch;
  }
  attachSignature(id: string, signature: string) {
    const l = this.lots.find((l) => l.id === id);
    if (
      !l ||
      !signature ||
      !['reserved', 'uncertain'].includes(l.status) ||
      (l.signature && l.signature !== signature) ||
      this.lots.some((x) => x.id !== id && x.signature === signature)
    )
      throw new Error('Invalid or duplicate transaction signature');
    l.signature = signature;
  }
  settle(
    id: string,
    outcome: 'confirmed' | 'failed' | 'uncertain',
    actualDebit = 0n,
    burned = 0n,
  ) {
    amount(actualDebit);
    amount(burned);
    const l = this.lots.find((l) => l.id === id);
    if (!l) throw new Error('Unknown reservation');
    if (l.status === 'confirmed' || l.status === 'failed') return false;
    if (outcome === 'uncertain') {
      l.status = 'uncertain';
      return false;
    }
    if (
      !l.signature ||
      actualDebit > l.reserved ||
      (outcome === 'confirmed' && (burned <= 0n || actualDebit === 0n)) ||
      (outcome === 'failed' && (burned !== 0n || actualDebit > l.costCeiling))
    ) {
      this.halted = true;
      throw new Error(
        'Receipt does not match reservation; funds remain reserved',
      );
    }
    const unused = l.reserved - actualDebit;
    if (l.stream === 'dip') this.released += unused;
    else this.treasuryReady += unused;
    this.spent += actualDebit;
    if (l.stream === 'treasury') this.treasurySpent += actualDebit;
    this.burned += burned;
    l.status = outcome;
    return true;
  }
  checkpoint() {
    return {
      version: 1,
      ...this.snapshot(),
      cycleLot: this.cycleLot.toString(),
      lastTreasuryAt: Number.isFinite(this.lastTreasuryAt)
        ? this.lastTreasuryAt
        : null,
      lastPriceAt: Number.isFinite(this.lastPriceAt) ? this.lastPriceAt : null,
      lastPrice: this.lastPrice,
      observations: this.observations,
      receipts: [...this.receipts],
    };
  }
  static restore(value: unknown) {
    if (!value || typeof value !== 'object')
      throw new Error('Invalid engine checkpoint');
    const v = { ...objectValue(value) };
    for (const key of [
      'operationsDebt',
      'treasuryCredited',
      'treasurySpent',
      'netPlatformRevenue',
    ])
      if (v[key] === undefined) v[key] = '0';
    if (v.version !== 1) throw new Error('Unsupported engine checkpoint');
    const e = new BuybackEngine();
    for (const key of [
      'held',
      'released',
      'creator',
      'platform',
      'operationsDebt',
      'treasuryReady',
      'treasuryCredited',
      'treasurySpent',
      'netPlatformRevenue',
      'spent',
      'burned',
      'cycleLot',
    ] as const) {
      e[key] = unsignedAmount(v[key]);
    }
    if (
      typeof v.armed !== 'boolean' ||
      typeof v.halted !== 'boolean' ||
      (v.venue !== 'curve' && v.venue !== 'pumpswap')
    )
      throw new Error('Invalid checkpoint state');
    e.armed = v.armed;
    e.halted = v.halted;
    e.venue = v.venue;
    for (const key of ['lastTreasuryAt', 'lastPriceAt'] as const) {
      e[key] = v[key] === null ? -Infinity : finiteNumber(v[key]);
    }
    if (
      typeof v.lastPrice !== 'number' ||
      !Number.isFinite(v.lastPrice) ||
      v.lastPrice < 0 ||
      !Array.isArray(v.observations) ||
      !Array.isArray(v.receipts) ||
      !Array.isArray(v.lots)
    )
      throw new Error('Invalid checkpoint records');
    e.lastPrice = v.lastPrice;
    e.observations = v.observations.map((value: unknown) => {
      const p = objectValue(value);
      const price = finiteNumber(p.price),
        at = finiteNumber(p.at);
      if (price <= 0) throw new Error('Invalid price observation');
      return { price, at };
    });
    e.receipts = new Set(
      v.receipts.map((r: unknown) => {
        if (typeof r !== 'string') throw new Error('Invalid receipt');
        return r;
      }),
    );
    const ids = new Set<string>();
    e.lots = v.lots.map((value: unknown) => {
      const l = objectValue(value);
      if (
        typeof l.id !== 'string' ||
        ids.has(l.id) ||
        (l.stream !== 'dip' && l.stream !== 'treasury') ||
        (l.status !== 'reserved' &&
          l.status !== 'confirmed' &&
          l.status !== 'failed' &&
          l.status !== 'uncertain') ||
        !Number.isFinite(l.sendAfter)
      )
        throw new Error('Invalid checkpoint lot');
      ids.add(l.id);
      const purchase = unsignedAmount(l.purchase),
        costCeiling = unsignedAmount(l.costCeiling),
        reserved = unsignedAmount(l.reserved);
      if (reserved !== purchase + costCeiling)
        throw new Error('Inconsistent reservation');
      if (l.signature !== undefined && typeof l.signature !== 'string')
        throw new Error('Invalid signature');
      return {
        id: l.id,
        stream: l.stream,
        status: l.status,
        sendAfter: finiteNumber(l.sendAfter),
        ...(l.signature === undefined ? {} : { signature: l.signature }),
        purchase,
        costCeiling,
        reserved,
      };
    });
    return e;
  }
  cancelUnsent(id: string) {
    const l = this.lots.find((l) => l.id === id);
    if (!l || l.status !== 'reserved' || l.signature)
      throw new Error('Only unsigned reservations can be cancelled');
    if (l.stream === 'dip') this.released += l.reserved;
    else this.treasuryReady += l.reserved;
    l.status = 'failed';
  }
  snapshot() {
    return {
      held: this.held.toString(),
      released: this.released.toString(),
      creator: this.creator.toString(),
      platform: this.platform.toString(),
      operationsDebt: this.operationsDebt.toString(),
      treasuryReady: this.treasuryReady.toString(),
      treasuryCredited: this.treasuryCredited.toString(),
      treasurySpent: this.treasurySpent.toString(),
      netPlatformRevenue: this.netPlatformRevenue.toString(),
      spent: this.spent.toString(),
      burned: this.burned.toString(),
      armed: this.armed,
      halted: this.halted,
      venue: this.venue,
      lots: this.lots.map((l) => ({
        ...l,
        purchase: l.purchase.toString(),
        costCeiling: l.costCeiling.toString(),
        reserved: l.reserved.toString(),
      })),
    };
  }
}
export type SimulationInput = { revenue: number; drop: number; main: boolean };
export function simulateBuybacks(input: SimulationInput) {
  if (
    !Number.isFinite(input.revenue) ||
    input.revenue < 0 ||
    input.revenue > 100000 ||
    !Number.isFinite(input.drop) ||
    input.drop < 0 ||
    input.drop > 99 ||
    typeof input.main !== 'boolean'
  )
    throw new Error('Invalid simulation input');
  const e = new BuybackEngine(),
    fees = parseSol(input.revenue.toFixed(9)),
    allocation = allocateFees(fees, input.main);
  e.creditCreatorFees('example-creator-fees', fees, input.main);
  e.observe(100, 0);
  const triggered = e.observe(100 - input.drop, 1000);
  const lots = e.reserveBatch(1000, 5000n);
  return {
    mode: 'simulation',
    triggered,
    allocation: {
      buyback: sol(allocation.buyback),
      creator: sol(allocation.creator),
      platform: sol(allocation.platform),
    },
    held: sol(e.held),
    released: sol(e.released),
    reserved: sol(lots.reduce((a, l) => a + l.reserved, 0n)),
    lotSize: sol(e.cycleLot),
    lots: lots.map((l) => ({
      id: l.id,
      purchaseSol: sol(l.purchase),
      maxCostsSol: sol(l.costCeiling),
      offsetSeconds: (l.sendAfter - 1000) / 1000,
    })),
    treasuryBuyback: sol(fraction(allocation.platform, 5000)),
    policy: POLICY.slippageBps / 100,
    notes:
      'Hypothetical SOL allocations. No quotes, transactions, or burns are executed. Treasury figure assumes platform allocation is net of zero operating costs.',
  };
}
