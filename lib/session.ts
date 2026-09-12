const encoder = new TextEncoder();
export const SESSION_COOKIE = 'loop_session';
export const SESSION_SECONDS = 8 * 60 * 60;
async function key(secret: string) {
  if (secret.length < 32)
    throw new Error('Session secret must be at least 32 characters.');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function passwordMatches(input: string, expected: string) {
  // Fixed-size digests avoid leaking matching password prefixes.
  const comparisonKey = await key('loop-password-comparison-key-v1-public');
  const digest = await crypto.subtle.sign(
    'HMAC',
    comparisonKey,
    encoder.encode(expected),
  );
  return crypto.subtle.verify(
    'HMAC',
    comparisonKey,
    digest,
    encoder.encode(input),
  );
}
export async function issueSession(
  secret: string,
  origin: string,
  now = Date.now(),
) {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${crypto.randomUUID()}`;
  return `${payload}.${hex(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(`${origin}|${payload}`)))}`;
}
export async function verifySession(
  value: string,
  secret: string,
  origin: string,
  now = Date.now(),
) {
  if (
    !/^\d{10}\.[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(value) ||
    secret.length < 32
  )
    return false;
  const [expires, nonce, signature] = value.split('.');
  const remaining = Number(expires) - Math.floor(now / 1000);
  if (remaining <= 0 || remaining > SESSION_SECONDS) return false;
  const bytes = Uint8Array.from(signature.match(/../g)!, (v) =>
    parseInt(v, 16),
  );
  return crypto.subtle.verify(
    'HMAC',
    await key(secret),
    bytes,
    encoder.encode(`${origin}|${expires}.${nonce}`),
  );
}
export function sessionCookie(
  value: string,
  secure: boolean,
  maxAge = SESSION_SECONDS,
) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
