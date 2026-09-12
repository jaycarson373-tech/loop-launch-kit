import { runtime } from './env';
import { BuybackEngine } from '../lib/buybacks';
import { HttpError } from './http';
export type LaunchRow = {
  id: string;
  owner: string;
  wallet: string;
  creator: string | null;
  plan: string;
  mint: string | null;
  metadata_uri: string | null;
  status: string;
  engine: string;
  revision: number;
  lock_token: string | null;
  lock_until: number;
  created_at: number;
  updated_at: number;
  last_error: string | null;
};
export type JobRow = {
  id: string;
  launch_id: string;
  kind: string;
  status: string;
  unsigned: string;
  signed: string | null;
  signature: string | null;
  block_height: number;
  details: string;
  created_at: number;
  updated_at: number;
  error: string | null;
};
export const db = () => runtime().DB;
export async function launch(id: string, owner?: string) {
  const r = await db()
    .prepare('SELECT * FROM launches WHERE id=?')
    .bind(id)
    .first<LaunchRow>();
  if (!r || (owner && r.owner !== owner))
    throw new HttpError(404, 'Launch not found.');
  return r;
}
export async function job(id: string) {
  const r = await db()
    .prepare('SELECT * FROM transactions WHERE id=?')
    .bind(id)
    .first<JobRow>();
  if (!r) throw new HttpError(404, 'Transaction not found.');
  return r;
}
export async function withLaunchLock<T>(
  id: string,
  fn: (row: LaunchRow, engine: BuybackEngine) => Promise<T>,
) {
  const token = crypto.randomUUID(),
    now = Date.now();
  const r = await db()
    .prepare(
      'UPDATE launches SET lock_token=?,lock_until=? WHERE id=? AND lock_until<?',
    )
    .bind(token, now + 180000, id, now)
    .run();
  if (!r.meta.changes)
    throw new HttpError(
      409,
      'This launch is being processed. Try again shortly.',
    );
  try {
    const row = await launch(id),
      engine = BuybackEngine.restore(JSON.parse(row.engine));
    return await fn(row, engine);
  } finally {
    await db()
      .prepare(
        'UPDATE launches SET lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=?',
      )
      .bind(id, token)
      .run();
  }
}
export async function saveEngine(
  row: LaunchRow,
  engine: BuybackEngine,
  extra: { status?: string; error?: string | null } = {},
) {
  const result = await db()
    .prepare(
      'UPDATE launches SET engine=?,revision=revision+1,status=?,last_error=?,updated_at=? WHERE id=? AND revision=? AND lock_token=? AND lock_until>?',
    )
    .bind(
      JSON.stringify(engine.checkpoint()),
      extra.status || row.status,
      extra.error ?? null,
      Date.now(),
      row.id,
      row.revision,
      row.lock_token,
      Date.now(),
    )
    .run();
  if (!result.meta.changes)
    throw new HttpError(
      409,
      'Launch changed while processing. No further transactions were sent.',
    );
  row.revision++;
  row.engine = JSON.stringify(engine.checkpoint());
  if (extra.status) row.status = extra.status;
}
export function publicLaunch(row: LaunchRow) {
  const p = JSON.parse(row.plan),
    e = BuybackEngine.restore(JSON.parse(row.engine));
  return {
    id: row.id,
    name: p.name,
    symbol: p.symbol,
    description: p.description,
    image: p.image,
    mint: row.mint,
    status: row.status,
    createdAt: row.created_at,
    website: p.website,
    social: p.social,
    balances: e.snapshot(),
    lastError: row.last_error,
  };
}
export async function insertJob(
  row: LaunchRow,
  kind: string,
  unsigned: string,
  blockHeight: number,
  details: unknown,
  id = crypto.randomUUID(),
) {
  const now = Date.now();
  await db()
    .prepare(
      'INSERT INTO transactions (id,launch_id,kind,status,unsigned,block_height,details,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM launches WHERE id=? AND lock_token=? AND lock_until>?)',
    )
    .bind(
      id,
      row.id,
      kind,
      'prepared',
      unsigned,
      blockHeight,
      JSON.stringify(details),
      now,
      now,
      row.id,
      row.lock_token,
      now,
    )
    .run();
  return job(id);
}
