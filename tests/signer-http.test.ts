import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startSigner } from '../keeper/signer-server.ts';
void test('signer HTTP boundary rejects unauthorized, oversized and malformed requests before KMS access', async () => {
  const original = {
    PORT: process.env.PORT,
    LOOP_SIGNER_TOKEN: process.env.LOOP_SIGNER_TOKEN,
    LOOP_KMS_KEY_RING: process.env.LOOP_KMS_KEY_RING,
  };
  const token = 'local-test-token-only-not-a-live-credential';
  process.env.PORT = '0';
  process.env.LOOP_SIGNER_TOKEN = token;
  process.env.LOOP_KMS_KEY_RING = 'projects/test/locations/test/keyRings/test';
  const server = startSigner();
  try {
    if (!server.listening) await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    const request = (body: string, authorized = true, path = '/v1/sign') =>
      fetch(origin + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authorized ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
      });
    assert.equal((await request('{}', false)).status, 401);
    for (const body of ['null', '[]', '"text"', '{', '{}'])
      assert.equal((await request(body)).status, 422);
    assert.equal((await request('x'.repeat(16001))).status, 413);
    assert.equal((await request('{}', true, '/unknown')).status, 422);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
