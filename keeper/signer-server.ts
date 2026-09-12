import { createServer } from 'node:http';
import { createPublicKey, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { validAddress } from '../lib/launch.ts';
import { publicAddress, reviewSigningPayload } from './solana-boundary.ts';
const kms = new KeyManagementServiceClient();
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function keyName(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id))
    throw new Error('Invalid launch identifier.');
  return `${required('LOOP_KMS_KEY_RING')}/cryptoKeys/loop-${id}`;
}
async function publicKey(version: string) {
  const [response] = await kms.getPublicKey({ name: version });
  const jwk = createPublicKey(response.pem!).export({ format: 'jwk' });
  if (!jwk.x || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519')
    throw new Error('A pure Ed25519 public key is required.');
  return publicAddress(Buffer.from(jwk.x, 'base64url'));
}
export function authorized(header: string | undefined, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`),
    given = Buffer.from(header || '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
export async function provision(id: string, payout: string) {
  const name = keyName(id),
    hex = Buffer.from(payout).toString('hex');
  if (typeof payout !== 'string' || !validAddress(payout))
    throw new Error('Payout address required.');
  try {
    await kms.createCryptoKey({
      parent: required('LOOP_KMS_KEY_RING'),
      cryptoKeyId: `loop-${id}`,
      cryptoKey: {
        purpose: 'ASYMMETRIC_SIGN',
        versionTemplate: {
          algorithm: 'EC_SIGN_ED25519',
          protectionLevel: 'SOFTWARE',
        },
        labels: {
          app: 'loop',
          payout_a: hex.slice(0, 44),
          payout_b: hex.slice(44),
        },
      },
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 6) throw error;
  }
  const [key] = await kms.getCryptoKey({ name });
  const stored = Buffer.from(
    (key.labels?.payout_a || '') + (key.labels?.payout_b || ''),
    'hex',
  ).toString();
  if (stored !== payout)
    throw new Error('Payout address differs from the immutable vault policy.');
  return { address: await publicKey(`${name}/cryptoKeyVersions/1`) };
}
async function sign(input: {
  launchId: string;
  address: string;
  transaction: string;
}) {
  const name = keyName(input.launchId);
  let version = `${name}/cryptoKeyVersions/1`;
  const treasuryVersion = process.env.LOOP_TREASURY_KMS_KEY_VERSION;
  const creator = await publicKey(version);
  let payout = '';
  if (input.address !== creator) {
    if (
      !treasuryVersion ||
      input.address !== (await publicKey(treasuryVersion))
    )
      throw new Error('Wallet is not controlled by this signer.');
    version = treasuryVersion;
  } else {
    const [key] = await kms.getCryptoKey({ name });
    payout = Buffer.from(
      (key.labels?.payout_a || '') + (key.labels?.payout_b || ''),
      'hex',
    ).toString();
  }
  const payload = reviewSigningPayload(
    input.transaction,
    input.address,
    [payout, process.env.LOOP_TREASURY_ADDRESS || ''].filter(Boolean),
  );
  const [result] = await kms.asymmetricSign({
    name: version,
    data: payload.message,
  });
  const signature =
    typeof result.signature === 'string'
      ? Buffer.from(result.signature, 'base64')
      : result.signature;
  if (!signature) throw new Error('Signature missing.');
  return { signedTransaction: payload.attach(signature) };
}
async function health() {
  await kms.getKeyRing({ name: required('LOOP_KMS_KEY_RING') });
  const version = required('LOOP_TREASURY_KMS_KEY_VERSION');
  const treasury = await publicKey(version);
  if (treasury !== required('LOOP_TREASURY_ADDRESS'))
    throw new Error(
      'Treasury key does not match its configured public address.',
    );
  return {
    ok: true,
    treasury,
    policyVersion: 1,
    maxBuyLamports: process.env.LOOP_MAX_BUY_LAMPORTS || '1000000000',
    maxTransferLamports:
      process.env.LOOP_MAX_TRANSFER_LAMPORTS || '100000000000',
  };
}
export function startSigner() {
  const secret = required('LOOP_SIGNER_TOKEN');
  if (secret.length < 32)
    throw new Error('Use a signing API token of at least 32 characters.');
  required('LOOP_KMS_KEY_RING');
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (!authorized(req.headers.authorization, secret)) {
      res.writeHead(401).end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16000) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      if (req.method !== 'POST') throw new Error('POST required.');
      const input = JSON.parse(Buffer.concat(chunks).toString());
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('An object body is required.');
      if (
        req.url === '/v1/wallets' &&
        (typeof input.launchId !== 'string' || typeof input.payout !== 'string')
      )
        throw new Error('Launch ID and payout required.');
      if (
        req.url === '/v1/sign' &&
        (typeof input.launchId !== 'string' ||
          typeof input.address !== 'string' ||
          typeof input.transaction !== 'string')
      )
        throw new Error('Signing fields required.');
      const result =
        req.url === '/v1/health'
          ? await health()
          : req.url === '/v1/wallets'
            ? await provision(input.launchId, input.payout)
            : req.url === '/v1/sign'
              ? await sign(input)
              : (() => {
                  throw new Error('Unknown route');
                })();
      res.writeHead(200).end(JSON.stringify(result));
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : 'Signing request failed',
      );
      res
        .writeHead(422)
        .end(JSON.stringify({ error: 'Signing request rejected.' }));
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  startSigner();
