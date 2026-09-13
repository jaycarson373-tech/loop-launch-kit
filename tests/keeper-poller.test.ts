import test from 'node:test';
import assert from 'node:assert/strict';
import { pollKeeperOnce } from '../keeper/poller.ts';
await test('keeper sends both app authentication and configured Vercel access, without redirects', async () => {
  let called = false;
  await pollKeeperOnce('https://loop.example', 't'.repeat(48), {
    bypass: 'test-access',
    fetcher: async (url, options) => {
      called = true;
      assert.equal(String(url), 'https://loop.example/api/loop/keeper');
      const headers = new Headers(options?.headers);
      assert.equal(headers.get('Authorization'), `Bearer ${'t'.repeat(48)}`);
      assert.equal(headers.get('x-vercel-protection-bypass'), 'test-access');
      assert.equal(options?.redirect, 'error');
      return Response.json({ status: 'paused', results: [] });
    },
  });
  assert.equal(called, true);
  await assert.rejects(pollKeeperOnce('http://loop.example', 't'.repeat(48)));
  await assert.rejects(
    pollKeeperOnce('https://loop.example/path', 't'.repeat(48)),
  );
  await assert.rejects(pollKeeperOnce('https://loop.example', 'short'));
});
await test('keeper rejects inaccessible or unrelated pages instead of recording a healthy heartbeat', async () => {
  for (const response of [
    new Response('protected', { status: 401 }),
    Response.json({ unrelated: true }),
  ]) {
    await assert.rejects(
      pollKeeperOnce('https://loop.example', 't'.repeat(48), {
        fetcher: async () => response,
      }),
    );
  }
});
