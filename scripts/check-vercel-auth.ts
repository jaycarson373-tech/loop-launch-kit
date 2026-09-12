import assert from 'node:assert/strict';
const origin = process.env.LOOP_TEST_ORIGIN!;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const endpoint = `${origin}/api/loop/`;
const forged = { 'oai-authenticated-user-id': 'loop-operator' };
assert.equal(
  (await fetch(`${endpoint}launches`, { headers: forged })).status,
  401,
);
assert.equal(
  (
    (await (await fetch(`${endpoint}config`, { headers: forged })).json()) as {
      signedIn: boolean;
    }
  ).signedIn,
  false,
);
const login = (password: string, from = origin) =>
  fetch(`${endpoint}session`, {
    method: 'POST',
    headers: { Origin: from, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
assert.equal(
  (await login(process.env.LOOP_TEST_PASSWORD!, 'https://attacker.example'))
    .status,
  403,
);
assert.equal((await login('wrong')).status, 401);
const signedIn = await login(process.env.LOOP_TEST_PASSWORD!);
assert.equal(signedIn.status, 200);
const setCookie = signedIn.headers.get('set-cookie')!;
assert.match(setCookie, /HttpOnly/);
assert.match(setCookie, /SameSite=Strict/);
const cookie = setCookie.split(';')[0];
assert.equal(
  (await fetch(`${endpoint}launches`, { headers: { Cookie: cookie } })).status,
  200,
);
assert.equal(
  (await fetch(`${endpoint}launches`, { headers: { Cookie: cookie + '00' } }))
    .status,
  401,
);
const logout = await fetch(`${endpoint}session`, {
  method: 'DELETE',
  headers: { Cookie: cookie, Origin: origin },
});
assert.equal(logout.status, 200);
assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/);
for (let i = 0; i < 30; i++) await login('wrong');
assert.equal((await login(process.env.LOOP_TEST_PASSWORD!)).status, 429);
console.log(
  'Passed Vercel production authentication checks: spoofed identity, origins, password, signed session, tampering, logout and durable rate limit.',
);
