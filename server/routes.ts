import {
  api,
  assert,
  HttpError,
  identity,
  signedInIdentity,
  json,
  readJson,
  sameOrigin,
} from './http';
import { authStatus, sessionRoute } from './auth';
import { runtime, config } from './env';
import { serviceReadiness } from './readiness';
import {
  db,
  launch,
  job,
  withLaunchLock,
  publicLaunch,
  type LaunchRow,
  type JobRow,
} from './store';
import { BuybackEngine } from '../lib/buybacks';
import { validatePlan, validAddress } from '../lib/launch';
import { provisionCreator } from './signer';
import { uploadPumpMetadata } from './metadata';
import { prepareCreate, assertLifetime } from './pump-adapter';
import { submit, reconcileOwned, processLaunch } from './execution';
async function requireLive() {
  const c = config();
  assert(
    c.launchEnabled,
    503,
    'Live launches need the RPC, treasury, and managed signing service configured.',
  );
  const readiness = await serviceReadiness();
  assert(
    readiness.servicesReady,
    503,
    'Launch services are not healthy. Run readiness checks before launching.',
  );
  return c;
}
function safePlan(value: Record<string, unknown>) {
  const keys = [
    'name',
    'symbol',
    'description',
    'image',
    'payout',
    'website',
    'social',
  ] as const;
  const plan = Object.fromEntries(
    keys.map((k) => [k, typeof value[k] === 'string' ? value[k] : '']),
  ) as Record<(typeof keys)[number], string>;
  const image = plan.image;
  assert(
    image === '' || /^\/api\/loop\/assets\/[0-9a-f-]{36}$/.test(image),
    422,
    'Upload artwork using Loop before saving.',
  );
  try {
    validatePlan({ ...plan, image: '' });
  } catch (error) {
    throw new HttpError(422, (error as Error).message);
  }
  return plan;
}
export async function handle(request: Request) {
  return api(async () => {
    const parts = new URL(request.url).pathname
        .replace(/^\/api\/loop\/?/, '')
        .split('/')
        .filter(Boolean),
      method = request.method;
    if (method === 'GET' && parts[0] === 'config')
      return json({
        ...config(),
        signedIn: !!(await signedInIdentity(request)),
        ...authStatus(),
      });
    if (parts[0] === 'session' && parts.length === 1)
      return sessionRoute(request);
    if (method === 'POST' && parts[0] === 'keeper') {
      const expected = runtime().LOOP_KEEPER_TOKEN;
      assert(
        expected &&
          request.headers.get('authorization') === `Bearer ${expected}`,
        401,
        'Keeper authentication required.',
      );
      const c = config();
      await db()
        .prepare(
          "INSERT INTO settings (key,value) VALUES ('keeper_heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .bind(String(Date.now()))
        .run();
      if (!c.automationEnabled) return json({ status: 'paused', results: [] });
      const rows = (
        await db()
          .prepare(
            "SELECT id FROM launches WHERE status IN ('active','submitted') ORDER BY updated_at ASC LIMIT 3",
          )
          .all<{ id: string }>()
      ).results;
      const results = [];
      for (const row of rows) {
        try {
          results.push(await processLaunch(row.id));
        } catch (e) {
          results.push({
            id: row.id,
            error: e instanceof Error ? e.message : 'Execution failed',
          });
        }
      }
      return json({ results });
    }
    const owner = await identity(request);
    if (method === 'GET' && parts[0] === 'readiness')
      return json(await serviceReadiness());
    if (method !== 'GET') sameOrigin(request);
    if (method === 'GET' && parts[0] === 'launches') {
      if (parts[1]) {
        const row = await launch(parts[1], owner);
        const jobs = (
          await db()
            .prepare(
              'SELECT id,kind,status,signature,details,created_at,error FROM transactions WHERE launch_id=? ORDER BY created_at DESC LIMIT 100',
            )
            .bind(row.id)
            .all()
        ).results;
        return json({
          ...publicLaunch(row),
          plan: JSON.parse(row.plan),
          wallet: row.wallet,
          creator: row.creator,
          transactions: jobs,
        });
      }
      const rows = (
        await db()
          .prepare(
            'SELECT * FROM launches WHERE owner=? ORDER BY created_at DESC LIMIT 100',
          )
          .bind(owner)
          .all<LaunchRow>()
      ).results;
      return json({
        launches: rows.map((r) => ({
          ...publicLaunch(r),
          plan: JSON.parse(r.plan),
          wallet: r.wallet,
          creator: r.creator,
        })),
      });
    }
    if (method === 'GET' && parts[0] === 'explore') {
      const rows = (
        await db()
          .prepare(
            "SELECT * FROM launches WHERE status='active' ORDER BY created_at DESC LIMIT 100",
          )
          .all<LaunchRow>()
      ).results;
      return json({ launches: rows.map(publicLaunch) });
    }
    if (method === 'GET' && parts[0] === 'treasury') {
      const c = config();
      const row = c.mainMint
        ? await db()
            .prepare('SELECT * FROM launches WHERE mint=?')
            .bind(c.mainMint)
            .first<LaunchRow>()
        : null;
      return json({
        treasury: c.treasury,
        mint: c.mainMint,
        automationEnabled: c.automationEnabled,
        balances: row ? publicLaunch(row).balances : null,
      });
    }
    if (method === 'GET' && parts[0] === 'history') {
      const rows = (
        await db()
          .prepare(
            "SELECT t.id,t.kind,t.status,t.signature,t.details,t.created_at,l.plan,l.mint FROM transactions t JOIN launches l ON l.id=t.launch_id WHERE t.status IN ('confirmed','failed','uncertain','submitted') AND t.kind='buyback' ORDER BY t.created_at DESC LIMIT 100",
          )
          .all<{
            id: string;
            kind: string;
            status: string;
            signature: string | null;
            details: string;
            created_at: number;
            plan: string;
            mint: string | null;
          }>()
      ).results;
      return json({
        transactions: rows.map((r) => ({
          ...r,
          details: JSON.parse(r.details),
          name: JSON.parse(r.plan).name,
          plan: undefined,
        })),
      });
    }
    if (parts[0] === 'assets') {
      if (method === 'GET' && parts[1]) {
        const row = await db()
          .prepare('SELECT * FROM assets WHERE id=?')
          .bind(parts[1])
          .first<{ id: string; owner: string; mime: string }>();
        assert(row, 404, 'Artwork not found.');
        const asset = await runtime().ASSETS.get(row.id);
        assert(asset, 404, 'Artwork not found.');
        return new Response(asset.body, {
          headers: {
            'Content-Type': row.mime,
            'Cache-Control': 'private,max-age=3600',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      if (method === 'POST') {
        const size = Number(request.headers.get('content-length'));
        assert(
          size > 0 && size <= 2 * 1024 * 1024,
          413,
          'Image must be under 2 MB.',
        );
        const mime = request.headers.get('content-type') || '';
        assert(
          ['image/png', 'image/jpeg', 'image/webp'].includes(mime),
          422,
          'Use a PNG, JPEG or WebP image.',
        );
        const data = await request.arrayBuffer();
        assert(data.byteLength <= 2 * 1024 * 1024, 413, 'Image is too large.');
        const b = new Uint8Array(data);
        const correct =
          mime === 'image/png'
            ? b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71
            : mime === 'image/jpeg'
              ? b[0] === 255 && b[1] === 216
              : new TextDecoder().decode(b.slice(0, 4)) === 'RIFF' &&
                new TextDecoder().decode(b.slice(8, 12)) === 'WEBP';
        assert(correct, 422, 'Image content does not match its format.');
        const id = crypto.randomUUID();
        await runtime().ASSETS.put(id, data, {
          httpMetadata: { contentType: mime },
        });
        await db()
          .prepare(
            'INSERT INTO assets (id,owner,mime,size,created_at) VALUES (?,?,?,?,?)',
          )
          .bind(id, owner, mime, data.byteLength, Date.now())
          .run();
        return json({ image: `/api/loop/assets/${id}` }, 201);
      }
    }
    if (method === 'POST' && parts[0] === 'launches' && parts.length === 1) {
      const input = await readJson(request);
      const plan = safePlan(input.plan || {});
      assert(
        validAddress(input.wallet),
        422,
        'Connect a Solana wallet before saving to the server.',
      );
      if (plan.image) {
        const image = await db()
          .prepare('SELECT owner FROM assets WHERE id=?')
          .bind(plan.image.split('/').pop())
          .first<{ owner: string }>();
        assert(
          image?.owner === owner,
          403,
          'Artwork belongs to a different workspace.',
        );
      }
      if (!plan.payout) plan.payout = input.wallet;
      const now = Date.now();
      if (input.id) {
        const existing = await launch(input.id, owner);
        assert(existing.status === 'draft', 409, 'Only drafts can be edited.');
        if (existing.creator)
          assert(
            JSON.parse(existing.plan).payout === plan.payout,
            409,
            'The payout address is fixed once a creator vault has been prepared.',
          );
        const updated = await db()
          .prepare(
            "UPDATE launches SET wallet=?,plan=?,metadata_uri=NULL,updated_at=? WHERE id=? AND owner=? AND status='draft' AND lock_until<?",
          )
          .bind(
            input.wallet,
            JSON.stringify(plan),
            now,
            existing.id,
            owner,
            now,
          )
          .run();
        assert(
          updated.meta.changes,
          409,
          'The draft is being processed. Try again shortly.',
        );
        return json({ ...publicLaunch(await launch(existing.id, owner)) });
      }
      const id = crypto.randomUUID();
      await db()
        .prepare(
          'INSERT INTO launches (id,owner,wallet,plan,engine,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          owner,
          input.wallet,
          JSON.stringify(plan),
          JSON.stringify(new BuybackEngine().checkpoint()),
          now,
          now,
        )
        .run();
      return json({ id, status: 'draft' }, 201);
    }
    if (
      method === 'POST' &&
      parts[0] === 'launches' &&
      parts[2] === 'prepare'
    ) {
      await requireLive();
      const input = await readJson(request);
      assert(
        validAddress(input.mint),
        422,
        'New mint public address required.',
      );
      await launch(parts[1], owner);
      return withLaunchLock(parts[1], async (row) => {
        assert(
          row.status === 'draft' || row.status === 'prepared',
          409,
          'This launch has already been submitted.',
        );
        const existing = await db()
          .prepare(
            "SELECT * FROM transactions WHERE launch_id=? AND kind='create' AND status='prepared' ORDER BY created_at DESC LIMIT 1",
          )
          .bind(row.id)
          .first<JobRow>();
        if (existing) {
          assert(
            row.mint === input.mint,
            409,
            'A previous launch quote exists. Cancel the unsigned quote before preparing a new mint.',
          );
          await assertLifetime(existing.block_height);
          return json({
            jobId: existing.id,
            unsigned: existing.unsigned,
            details: JSON.parse(existing.details),
            blockHeight: existing.block_height,
          });
        }
        if (!row.creator) {
          row.creator = await provisionCreator(
            row.id,
            JSON.parse(row.plan).payout,
          );
          await db()
            .prepare(
              'UPDATE launches SET creator=? WHERE id=? AND lock_token=?',
            )
            .bind(row.creator, row.id, row.lock_token)
            .run();
        }
        const uri = row.metadata_uri || (await uploadPumpMetadata(row));
        const p = await prepareCreate(row, input.mint, uri);
        const jobId = crypto.randomUUID(),
          now = Date.now();
        await db().batch([
          db()
            .prepare(
              "UPDATE launches SET mint=?,metadata_uri=?,status='prepared',updated_at=? WHERE id=? AND lock_token=? AND lock_until>?",
            )
            .bind(input.mint, uri, now, row.id, row.lock_token, now),
          db()
            .prepare(
              "INSERT INTO transactions (id,launch_id,kind,status,unsigned,block_height,details,created_at,updated_at) SELECT ?,?,'create','prepared',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM launches WHERE id=? AND mint=? AND lock_token=?)",
            )
            .bind(
              jobId,
              row.id,
              p.unsigned,
              p.blockHeight,
              JSON.stringify({
                ...p.details,
                feeLamports: p.feeLamports,
                simulation: p.simulation,
              }),
              now,
              now,
              row.id,
              input.mint,
              row.lock_token,
            ),
        ]);
        await job(jobId);
        return json({ jobId, ...p, mint: input.mint });
      });
    }
    if (
      method === 'POST' &&
      parts[0] === 'transactions' &&
      parts[2] === 'submit'
    ) {
      const input = await readJson(request, 15000);
      assert(
        typeof input.signed === 'string' && input.signed.length < 5000,
        422,
        'Signed transaction required.',
      );
      const j = await job(parts[1]);
      await launch(j.launch_id, owner);
      return withLaunchLock(j.launch_id, async (row, e) =>
        json(await submit(row, j, input.signed, e)),
      );
    }
    if (
      method === 'POST' &&
      parts[0] === 'launches' &&
      parts[2] === 'reconcile'
    )
      return json(await reconcileOwned(parts[1], owner));
    if (
      method === 'POST' &&
      parts[0] === 'launches' &&
      parts[2] === 'cancel-quote'
    ) {
      await launch(parts[1], owner);
      return withLaunchLock(parts[1], async (row) => {
        const signed = await db()
          .prepare(
            "SELECT id FROM transactions WHERE launch_id=? AND kind='create' AND signature IS NOT NULL",
          )
          .bind(row.id)
          .first();
        assert(
          !signed,
          409,
          'A signed launch must be reconciled, not cancelled.',
        );
        assert(row.status === 'prepared', 409, 'No unsigned quote to cancel.');
        await db().batch([
          db()
            .prepare(
              "UPDATE transactions SET status='cancelled',updated_at=? WHERE launch_id=? AND kind='create' AND status='prepared' AND signature IS NULL",
            )
            .bind(Date.now(), row.id),
          db()
            .prepare(
              "UPDATE launches SET status='draft',mint=NULL,updated_at=? WHERE id=? AND lock_token=?",
            )
            .bind(Date.now(), row.id, row.lock_token),
        ]);
        return json({ status: 'draft' });
      });
    }
    throw new HttpError(404, 'Endpoint not found.');
  });
}
