import { runtime } from './env';
import { assert } from './http';
import type { LaunchRow } from './store';
export async function uploadPumpMetadata(row: LaunchRow) {
  const p = JSON.parse(row.plan);
  assert(
    typeof p.image === 'string' && p.image.startsWith('/api/loop/assets/'),
    422,
    'Upload token artwork before launching.',
  );
  const id = p.image.split('/').pop()!;
  const stored = await runtime().ASSETS.get(id);
  assert(stored, 404, 'Token artwork was not found.');
  const form = new FormData();
  form.set(
    'file',
    new Blob([await stored.arrayBuffer()], {
      type: stored.httpMetadata?.contentType || 'image/png',
    }),
    'token-image',
  );
  form.set('name', p.name);
  form.set('symbol', p.symbol);
  form.set('description', p.description || '');
  form.set('showName', 'true');
  if (p.website) form.set('website', p.website);
  if (p.social) form.set('twitter', p.social);
  const response = await fetch('https://pump.fun/api/ipfs', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  assert(
    response.ok,
    503,
    'Pump metadata hosting is unavailable. Your draft is saved; no launch payment was sent.',
  );
  const result = (await response.json()) as { metadataUri?: string };
  assert(
    result.metadataUri &&
      result.metadataUri.startsWith('https://') &&
      result.metadataUri.length <= 200,
    503,
    'Metadata service returned an unsupported URI.',
  );
  return result.metadataUri;
}
