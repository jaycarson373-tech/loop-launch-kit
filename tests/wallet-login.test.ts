import test from 'node:test';
import assert from 'node:assert/strict';
import { getAddressDecoder } from '@solana/kit';
import { loginMessage, verifyWalletMessage } from '../lib/wallet-login.ts';
import { issueSession, readSession } from '../lib/session.ts';

await test('wallet login verifies only the exact challenge and signing wallet', async () => {
  const wallet = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  const other = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  const address = getAddressDecoder().decode(
    new Uint8Array(await crypto.subtle.exportKey('raw', wallet.publicKey)),
  );
  const otherAddress = getAddressDecoder().decode(
    new Uint8Array(await crypto.subtle.exportKey('raw', other.publicKey)),
  );
  const message = loginMessage(
    'https://loop.example',
    address,
    'solana:devnet',
    'a'.repeat(32),
    Date.now(),
  );
  const bytes = await crypto.subtle.sign(
    'Ed25519',
    wallet.privateKey,
    new TextEncoder().encode(message),
  );
  const signature = Buffer.from(bytes).toString('hex');
  assert.equal(await verifyWalletMessage(address, message, signature), true);
  assert.equal(
    await verifyWalletMessage(otherAddress, message, signature),
    false,
  );
  assert.equal(
    await verifyWalletMessage(
      address,
      message.replace('loop.example', 'attacker.example'),
      signature,
    ),
    false,
  );
  assert.equal(await verifyWalletMessage(address, message, '00'), false);
  assert.equal(await verifyWalletMessage('invalid', message, signature), false);
  assert.match(message, /This does not authorize a transaction or move funds/);
});
await test('session authentication binds the wallet subject and rejects subject substitution', async () => {
  const secret = 's'.repeat(64),
    origin = 'https://loop.example';
  const subject = 'wallet:So11111111111111111111111111111111111111112';
  const token = await issueSession(secret, origin, Date.now(), subject);
  assert.equal((await readSession(token, secret, origin))?.subject, subject);
  assert.equal(
    await readSession(token.replace(subject, 'loop-operator'), secret, origin),
    null,
  );
});
