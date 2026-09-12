import { config } from './env';
import { signedWriteStatements } from '../lib/transaction-ledger';
import { assert, HttpError } from './http';
import {
  db,
  launch,
  withLaunchLock,
  saveEngine,
  insertJob,
  type LaunchRow,
  type JobRow,
} from './store';
import { BuybackEngine, POLICY } from '../lib/buybacks';
import {
  market,
  prepareBuy,
  prepareClaim,
  prepareTransfer,
  verifySigned,
  receipt,
  sendSigned,
  assertLifetime,
  type Prepared,
} from './pump-adapter';
import { signJob } from './signer';
const COST_CEILING = 5_000_000n; // Covers fee and possible account rent; settlement returns unused budget.
const pendingSql =
  "SELECT * FROM transactions WHERE launch_id=? AND status IN ('prepared','signed','submitted','uncertain') ORDER BY created_at";
async function updateJob(
  j: JobRow,
  status: string,
  error: string | null = null,
) {
  await db()
    .prepare('UPDATE transactions SET status=?,error=?,updated_at=? WHERE id=?')
    .bind(status, error, Date.now(), j.id)
    .run();
  j.status = status;
}
export async function submit(
  row: LaunchRow,
  j: JobRow,
  signed: string,
  engine: BuybackEngine,
) {
  if (j.signature) {
    const signedCheck = verifySigned(j.unsigned, signed);
    assert(
      signedCheck.signature === j.signature,
      409,
      'This transaction already has a different signature.',
    );
    return { signature: j.signature, status: j.status };
  }
  assert(
    config().launchEnabled,
    503,
    'Execution is paused. Signed submissions are disabled.',
  );
  assert(j.status === 'prepared', 409, 'This transaction cannot be submitted.');
  await assertLifetime(j.block_height);
  const verified = verifySigned(j.unsigned, signed);
  const details = JSON.parse(j.details);
  if (details.lotId) engine.attachSignature(details.lotId, verified.signature);
  const now = Date.now(),
    status = j.kind === 'create' ? 'submitted' : row.status;
  const checkpoint = JSON.stringify(engine.checkpoint());
  const writes = signedWriteStatements({
    launchId: row.id,
    jobId: j.id,
    revision: row.revision,
    lockToken: row.lock_token,
    now,
    engine: checkpoint,
    status,
    signed,
    signature: verified.signature,
  });
  const results = await db().batch(
    writes.map((w) =>
      db()
        .prepare(w.sql)
        .bind(...w.args),
    ),
  );
  assert(
    results.every((r) => r.meta.changes === 1),
    409,
    'Transaction reservation changed. No transaction was sent.',
  );
  row.status = status;
  row.revision++;
  row.engine = checkpoint;
  j.signature = verified.signature;
  j.signed = signed;
  try {
    const signature = await sendSigned(verified.raw);
    assert(
      signature === verified.signature,
      503,
      'RPC returned an unexpected signature.',
    );
    await updateJob(j, 'submitted');
  } catch {
    await updateJob(
      j,
      'uncertain',
      'Submission outcome is being reconciled. Do not repay or resend.',
    );
  }
  return { signature: j.signature, status: j.status };
}
export async function reconcile(row: LaunchRow, j: JobRow, e: BuybackEngine) {
  if (!j.signature || ['confirmed', 'failed', 'cancelled'].includes(j.status))
    return;
  const d = JSON.parse(j.details),
    r = await receipt(j.signature, d, j.unsigned);
  if (!r) {
    await updateJob(
      j,
      'uncertain',
      'Confirmation not yet established; reservation retained.',
    );
    return;
  }
  if (!e.receipts.has(j.id)) {
    if (j.kind === 'create') {
      if (!r.failed) {
        await market(row);
        row.status = 'active';
      } else row.status = 'failed';
    } else if (d.lotId) {
      try {
        e.settle(d.lotId, r.failed ? 'failed' : 'confirmed', r.debit, r.burned);
      } catch (error) {
        await saveEngine(row, e, {
          error: error instanceof Error ? error.message : 'Settlement halted',
        });
        throw error;
      }
    } else if (j.kind === 'claim') {
      if (!r.failed && r.claimed > 0n)
        e.creditCreatorFees(j.id, r.claimed, row.mint === config().mainMint);
      const cost = r.failed
        ? r.fee
        : r.claimed - r.netDelta > r.fee
          ? r.claimed - r.netDelta
          : r.fee;
      e.recordOperationsCost(cost);
    } else if (j.kind === 'payout' || j.kind === 'platform') {
      const key = j.kind === 'payout' ? 'creator' : 'platform';
      assert(
        r.debit <= BigInt(d.debitCeiling) && e[key] >= r.debit,
        422,
        'Transfer debit exceeds its reserved allocation.',
      );
      if (!r.failed)
        assert(
          r.received === BigInt(d.amount),
          422,
          'Transfer did not credit the expected destination amount.',
        );
      e[key] -= r.debit;
    }
    e.receipts.add(j.id);
    await saveEngine(row, e, { status: row.status });
  }
  if (j.kind === 'platform' && !r.failed && r.received > 0n)
    await db()
      .prepare(
        'INSERT OR IGNORE INTO treasury_revenue (id,amount,created_at) VALUES (?,?,?)',
      )
      .bind(j.id, r.received.toString(), Date.now())
      .run();
  await db()
    .prepare('UPDATE transactions SET details=? WHERE id=?')
    .bind(
      JSON.stringify({
        ...d,
        receipt: {
          debit: r.debit.toString(),
          burned: r.burned.toString(),
          received: r.received.toString(),
          fee: r.fee.toString(),
          slot: r.slot,
        },
      }),
      j.id,
    )
    .run();
  await updateJob(
    j,
    r.failed ? 'failed' : 'confirmed',
    r.failed ? JSON.stringify(r.error) : null,
  );
}
async function executePrepared(
  row: LaunchRow,
  e: BuybackEngine,
  kind: string,
  p: Prepared,
  extra: Record<string, unknown> = {},
) {
  const details = { ...p.details, ...extra, feeLamports: p.feeLamports };
  const j = await insertJob(row, kind, p.unsigned, p.blockHeight, details);
  const signed = await signJob(row.id, String(p.details.payer), p.unsigned);
  return submit(row, j, signed, e);
}
export async function processLaunch(id: string) {
  return withLaunchLock(id, async (row, e) => {
    assert(
      config().automationEnabled,
      503,
      'Configure the RPC, treasury, managed signer and keeper authentication to run automation.',
    );
    const previous = (await db().prepare(pendingSql).bind(id).all<JobRow>())
      .results;
    for (const j of previous) {
      if (j.signature) await reconcile(row, j, e);
      else if (j.kind !== 'create') {
        try {
          await assertLifetime(j.block_height);
          const d = JSON.parse(j.details);
          const signed = await signJob(row.id, d.payer, j.unsigned);
          await submit(row, j, signed, e);
        } catch (error) {
          if (error instanceof HttpError && error.status === 409) {
            const d = JSON.parse(j.details);
            if (d.lotId) e.cancelUnsent(d.lotId);
            await saveEngine(row, e);
            await updateJob(j, 'cancelled', 'Unsigned quote expired.');
          } else throw error;
        }
      }
    }
    const pending = (await db().prepare(pendingSql).bind(id).all<JobRow>())
      .results;
    if (pending.length)
      return { id, status: 'reconciling', pending: pending.map((j) => j.id) };
    if (row.status !== 'active' || e.halted)
      return { id, status: row.status, halted: e.halted };
    if (row.mint === config().mainMint) {
      const credits = (
        await db()
          .prepare(
            'SELECT id,amount FROM treasury_revenue WHERE credited_mint IS NULL ORDER BY created_at LIMIT 100',
          )
          .all<{ id: string; amount: string }>()
      ).results;
      for (const credit of credits)
        e.creditNetPlatformRevenue(
          `platform:${credit.id}`,
          BigInt(credit.amount),
        );
      if (credits.length) {
        await saveEngine(row, e);
        await db().batch(
          credits.map((credit) =>
            db()
              .prepare(
                'UPDATE treasury_revenue SET credited_mint=? WHERE id=? AND credited_mint IS NULL',
              )
              .bind(row.mint, credit.id),
          ),
        );
      }
    }

    const m = await market(row);
    if (e.venue !== m.venue) {
      e.migrate(m.venue);
      e.resumeVerifiedVenue();
    }
    e.observe(m.price, Date.now());
    await saveEngine(row, e);
    // Recover only reservations for which no signed or unsigned job was ever persisted.
    const orphan = e.pending().filter((l) => !l.signature);
    for (const l of orphan) {
      const existing = await db()
        .prepare('SELECT id FROM transactions WHERE launch_id=? AND id=?')
        .bind(row.id, `${row.id}:${l.id}`)
        .first();
      if (!existing) e.cancelUnsent(l.id);
    }
    if (orphan.length) await saveEngine(row, e);
    if (e.pending().length) return { id, status: 'reserved' };
    const stream =
      row.mint === config().mainMint &&
      e.treasuryReady >= POLICY.minLot + COST_CEILING &&
      Date.now() - e.lastTreasuryAt >= POLICY.treasuryIntervalMs
        ? 'treasury'
        : 'dip';
    const lots = e.reserveBatch(Date.now(), COST_CEILING, stream);
    await saveEngine(row, e);
    if (lots.length) {
      for (let index = 0; index < lots.length; index++) {
        const lot = lots[index];
        try {
          if (index > 0)
            await new Promise((r) => setTimeout(r, POLICY.spacingMs));
          const p = await prepareBuy(row, lot.purchase, stream, lot.id);
          assert(
            BigInt(p.feeLamports) <= lot.costCeiling,
            422,
            'Network fee exceeds the reservation.',
          );
          const j = await insertJob(
            row,
            'buyback',
            p.unsigned,
            p.blockHeight,
            { ...p.details, lotId: lot.id },
            `${row.id}:${lot.id}`,
          );
          const signed = await signJob(
            row.id,
            String(p.details.payer),
            p.unsigned,
          );
          const sent = await submit(row, j, signed, e);
          if (sent.status === 'uncertain') break;
        } catch (error) {
          for (const remaining of lots.slice(index)) {
            const exists = await db()
              .prepare('SELECT id FROM transactions WHERE id=?')
              .bind(`${row.id}:${remaining.id}`)
              .first();
            if (!exists && !remaining.signature) e.cancelUnsent(remaining.id);
          }
          await saveEngine(row, e, {
            error:
              error instanceof Error ? error.message : 'Buy preparation failed',
          });
          throw error;
        }
      }
      return { id, status: 'buybacks-submitted', lots: lots.length };
    }
    // A transfer reserves its full balance via the durable pending job before any subsequent operation.
    const plan = JSON.parse(row.plan);
    for (const kind of ['payout', 'platform'] as const) {
      if (kind === 'payout') {
        const recent = await db()
          .prepare(
            "SELECT id FROM transactions WHERE launch_id=? AND kind='payout' AND status='confirmed' AND updated_at>? LIMIT 1",
          )
          .bind(row.id, Date.now() - 3600000)
          .first();
        if (recent) continue;
      }
      const available = kind === 'payout' ? e.creator : e.platform;
      if (available >= COST_CEILING + 1_000_000n) {
        const destination = kind === 'payout' ? plan.payout : config().treasury;
        assert(destination, 503, 'Payout destination is missing.');
        const p = await prepareTransfer(
          row.creator!,
          destination,
          available - COST_CEILING > POLICY.maxPayout
            ? POLICY.maxPayout
            : available - COST_CEILING,
          kind,
        );
        return executePrepared(row, e, kind, p, {
          debitCeiling: available.toString(),
        });
      }
    }
    const claim = await prepareClaim(row);
    if (claim) return executePrepared(row, e, 'claim', claim);
    return {
      id,
      status: 'watching',
      held: e.held.toString(),
      released: e.released.toString(),
    };
  });
}
export async function reconcileOwned(id: string, owner: string) {
  const r = await launch(id, owner);
  return withLaunchLock(r.id, async (row, e) => {
    const jobs = (await db().prepare(pendingSql).bind(id).all<JobRow>())
      .results;
    for (const j of jobs) if (j.signature) await reconcile(row, j, e);
    return {
      status: row.status,
      transactions: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        signature: j.signature,
      })),
    };
  });
}
