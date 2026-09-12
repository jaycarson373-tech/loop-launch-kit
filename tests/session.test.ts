import test from 'node:test';
import assert from 'node:assert/strict';
import {
  issueSession,
  verifySession,
  passwordMatches,
  sessionCookie,
  SESSION_SECONDS,
} from '../lib/session.ts';
const secret = 'a'.repeat(64),
  origin = 'https://loop.example';
await test('workspace sessions reject tampering, expiry, another origin and a rotated key', async () => {
  const now = 1800000000000;
  const value = await issueSession(secret, origin, now);
  assert.equal(await verifySession(value, secret, origin, now), true);
  assert.equal(
    await verifySession(value.slice(0, -2) + 'zz', secret, origin, now),
    false,
  );
  assert.equal(
    await verifySession(value, secret, origin, now + SESSION_SECONDS * 1000),
    false,
  );
  assert.equal(
    await verifySession(value, secret, 'https://attacker.example', now),
    false,
  );
  assert.equal(await verifySession(value, 'b'.repeat(64), origin, now), false);
  assert.equal(await verifySession(value, secret, origin, now - 10000), false);
  assert.equal(await verifySession('malformed', secret, origin, now), false);
});
await test('workspace password checks and cookies', async () => {
  assert.equal(await passwordMatches(secret, secret), true);
  assert.equal(await passwordMatches('a'.repeat(63), secret), false);
  assert.equal(await passwordMatches('b'.repeat(64), secret), false);
  assert.match(
    sessionCookie('token', true),
    /HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/,
  );
  assert.doesNotMatch(sessionCookie('token', false), /Secure/);
});
