// Local-only integration checks. Requires vinext dev and applied D1 migrations.
import assert from 'node:assert/strict';
const origin = process.env.LOOP_TEST_ORIGIN || 'http://localhost:3001';
assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(origin).hostname),
  'Integration checks must run locally.',
);
const login = await fetch(`${origin}/signin-with-chatgpt?return_to=/`, {
  redirect: 'manual',
});
const cookie = login.headers
  .getSetCookie()
  .map((v) => v.split(';')[0])
  .join('; ');
assert.ok(cookie);
async function api(
  path: string,
  body?: unknown,
  options: {
    anonymous?: boolean;
    origin?: string;
    raw?: BodyInit;
    mime?: string;
  } = {},
) {
  const response = await fetch(`${origin}/api/loop/${path}`, {
    method: body === undefined && !options.raw ? 'GET' : 'POST',
    headers: {
      ...(options.anonymous ? {} : { Cookie: cookie }),
      Origin: options.origin || origin,
      'Content-Type': options.mime || 'application/json',
    },
    body:
      options.raw || (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  return { status: response.status, data };
}
assert.equal(
  (await api('launches', undefined, { anonymous: true })).status,
  401,
);
const config = await api('config');
assert.equal(config.status, 200);
assert.equal(
  config.data.launchEnabled,
  false,
  'Run with live credentials absent.',
);
const plan = {
  name: 'Loop integration check',
  symbol: 'CHECK',
  description: 'Local API test',
  image: '',
  payout: '',
  website: 'https://example.com',
  social: '',
};
const wallet = 'So11111111111111111111111111111111111111112';
assert.equal(
  (
    await api(
      'launches',
      { plan, wallet },
      { origin: 'https://untrusted.example' },
    )
  ).status,
  403,
);
assert.equal(
  (await api('launches', { plan: { ...plan, symbol: '!' }, wallet })).status,
  422,
);
const created = await api('launches', { plan, wallet });
assert.equal(created.status, 201);
const id = created.data.id;
const loaded = await api(`launches/${id}`);
assert.equal(loaded.data.plan.payout, wallet);
assert.equal(loaded.data.balances.held, '0');
assert.equal(loaded.data.status, 'draft');
const updated = await api('launches', {
  id,
  plan: { ...plan, description: 'Edited and persisted' },
  wallet,
});
assert.equal(updated.status, 200);
assert.equal(
  (await api(`launches/${id}`)).data.description,
  'Edited and persisted',
);
assert.equal(
  (await api(`launches/${id}/prepare`, { mint: wallet })).status,
  503,
);
assert.equal((await api('keeper', {})).status, 401);
assert.equal(
  (await api('assets', undefined, { raw: 'not an image', mime: 'image/png' }))
    .status,
  422,
);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0f8AAAAASUVORK5CYII=',
  'base64',
);
const asset = await api('assets', undefined, { raw: png, mime: 'image/png' });
assert.equal(asset.status, 201);
const image = await fetch(`${origin}${asset.data.image}`, {
  headers: { Cookie: cookie },
});
assert.equal(image.status, 200);
assert.equal(image.headers.get('content-type'), 'image/png');
assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
assert.equal(
  (
    await api('launches', {
      id,
      plan: { ...plan, image: asset.data.image },
      wallet,
    })
  ).status,
  200,
);
for (const path of ['history', 'explore', 'treasury'])
  assert.equal((await api(path)).status, 200);
console.log(
  'Passed 18 local API checks: authentication, origins, validation, persistence, image storage, execution guards and dashboards.',
);
