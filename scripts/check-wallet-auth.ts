// Synthetic in-memory message keys and a local database only. No on-chain signing or broadcast.
import assert from 'node:assert/strict';
import { getAddressDecoder } from '@solana/kit';
import { createClient } from '@libsql/client';
const origin = process.env.LOOP_TEST_ORIGIN!;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
assert.ok(process.env.TURSO_DATABASE_URL?.startsWith('file:'));
const database = createClient({ url: process.env.TURSO_DATABASE_URL! });
const api = async (
  path: string,
  body?: unknown,
  cookie = '',
  method = body === undefined ? 'GET' : 'POST',
  from = origin,
) => {
  const options: RequestInit = {
    method,
    headers: {
      Cookie: cookie,
      Origin: from,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) {
    assert.notEqual(method, 'GET');
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${origin}/api/loop/${path}`, options);
  return response;
};
async function wallet() {
  const keys = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  const address = getAddressDecoder().decode(
    new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)),
  );
  return {
    address,
    sign: async (message: string) =>
      Buffer.from(
        await crypto.subtle.sign(
          'Ed25519',
          keys.privateKey,
          new TextEncoder().encode(message),
        ),
      ).toString('hex'),
  };
}
const alice = await wallet(),
  bob = await wallet();
async function challenge(who: typeof alice) {
  const response = await api('auth/challenge', { wallet: who.address });
  assert.equal(response.status, 200, await response.clone().text());
  return {
    ...((await response.json()) as { id: string; message: string }),
    cookie: response.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; '),
  };
}
async function signIn(who: typeof alice) {
  const c = await challenge(who);
  const response = await api(
    'auth/verify',
    { id: c.id, signature: await who.sign(c.message) },
    c.cookie,
  );
  assert.equal(response.status, 200, await response.clone().text());
  return response.headers
    .getSetCookie()
    .find((v) => v.startsWith('loop_session='))!
    .split(';')[0];
}
try {
  const c = await challenge(alice),
    signed = { id: c.id, signature: await alice.sign(c.message) };
  assert.equal(
    (await api('auth/verify', signed)).status,
    401,
    'The browser challenge cookie is required.',
  );
  assert.equal(
    (
      await api(
        'auth/verify',
        signed,
        c.cookie,
        'POST',
        'https://attacker.example',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        'auth/verify',
        { id: c.id, signature: await bob.sign(c.message) },
        c.cookie,
      )
    ).status,
    401,
  );
  const attempts = await Promise.all([
    api('auth/verify', signed, c.cookie),
    api('auth/verify', signed, c.cookie),
  ]);
  assert.deepEqual(
    attempts.map((r) => r.status).sort((a, b) => a - b),
    [200, 401],
    'A concurrent replay must not issue a second session.',
  );
  assert.equal((await api('auth/verify', signed, c.cookie)).status, 401);
  const expired = await challenge(bob);
  await database.execute({
    sql: 'UPDATE auth_challenges SET expires_at=0 WHERE id=?',
    args: [expired.id],
  });
  assert.equal(
    (
      await api(
        'auth/verify',
        { id: expired.id, signature: await bob.sign(expired.message) },
        expired.cookie,
      )
    ).status,
    401,
  );
  const aliceCookie = await signIn(alice),
    bobCookie = await signIn(bob);
  const plan = {
    name: 'Wallet isolation test',
    symbol: 'TEST',
    description: 'Local fixture',
    image: '',
    payout: '',
    website: '',
    social: '',
  };
  const create = await api(
    'launches',
    { plan, wallet: alice.address },
    aliceCookie,
  );
  assert.equal(create.status, 201);
  const draft = (await create.json()) as { id: string };
  assert.equal(
    (await api(`launches/${draft.id}`, undefined, bobCookie)).status,
    404,
  );
  assert.equal(
    (
      await api(
        'launches',
        { id: draft.id, plan, wallet: bob.address },
        bobCookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (await api(`launches/${draft.id}/reconcile`, {}, bobCookie)).status,
    404,
  );
  assert.equal(
    (await api(`launches/${draft.id}/cancel-quote`, {}, bobCookie)).status,
    404,
  );
  assert.equal(
    (await api('launches', { plan, wallet: bob.address }, aliceCookie)).status,
    403,
  );
  const list = (await (await api('launches', undefined, bobCookie)).json()) as {
    launches: { id: string }[];
  };
  assert.ok(!list.launches.some((row) => row.id === draft.id));
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0f8AAAAASUVORK5CYII=',
    'base64',
  );
  const upload = await fetch(`${origin}/api/loop/assets`, {
    method: 'POST',
    headers: {
      Cookie: aliceCookie,
      Origin: origin,
      'Content-Type': 'image/png',
    },
    body: png,
  });
  assert.equal(upload.status, 201);
  const { image } = (await upload.json()) as { image: string };
  assert.equal(
    (await fetch(origin + image, { headers: { Cookie: bobCookie } })).status,
    404,
  );
  assert.equal((await fetch(origin + image)).status, 404);
  assert.equal(
    (
      await api(
        'launches',
        { plan: { ...plan, image }, wallet: bob.address },
        bobCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        'launches',
        { id: draft.id, plan: { ...plan, image }, wallet: alice.address },
        aliceCookie,
      )
    ).status,
    200,
  );
  // Only a local database fixture is published; no token or transaction exists.
  await database.execute({
    sql: "UPDATE launches SET status='active' WHERE id=?",
    args: [draft.id],
  });
  assert.equal((await fetch(origin + image)).status, 200);
  for (const path of ['explore', 'treasury', 'history'])
    assert.equal((await api(path)).status, 200);
  assert.equal(
    (await api('session', undefined, aliceCookie, 'DELETE')).status,
    200,
  );
  assert.equal(
    (await api('launches', undefined, aliceCookie)).status,
    401,
    'Logout must revoke the copied cookie.',
  );
  assert.equal((await api('launches', undefined, bobCookie)).status, 200);
  console.log(
    'Passed wallet authentication and user isolation: real Ed25519 message verification, browser/origin binding, concurrent replay, expiry, private drafts/artwork, public active artwork, and revoked logout.',
  );
} finally {
  database.close();
}
