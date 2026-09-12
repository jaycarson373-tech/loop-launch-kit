import { runtime } from './env';
import { SESSION_COOKIE, verifySession } from '../lib/session';
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function assert(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
export async function signedInIdentity(request: Request) {
  const env = runtime();
  if (env.AUTH_MODE === 'sites')
    return request.headers.get('oai-authenticated-user-id');
  const session = request.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return session &&
    env.LOOP_SESSION_SECRET &&
    (await verifySession(
      session,
      env.LOOP_SESSION_SECRET,
      new URL(request.url).origin,
    ))
    ? 'loop-operator'
    : null;
}
export async function identity(request: Request) {
  const id = await signedInIdentity(request);
  assert(id, 401, 'Sign in to access your Loop workspace.');
  return id;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  assert(
    origin === new URL(request.url).origin,
    403,
    'Request origin was not accepted.',
  );
}
export async function readJson(request: Request, max = 32_000) {
  const reader = request.body?.getReader();
  assert(reader, 400, 'Request body required.');
  let total = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new HttpError(413, 'Request is too large.');
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    assert(
      parsed && typeof parsed === 'object' && !Array.isArray(parsed),
      400,
      'JSON object required.',
    );
    return parsed;
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function api(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(
      'Loop API failure:',
      e instanceof Error ? e.message : 'Unknown error',
    );
    return json(
      {
        error:
          'The request could not be completed. Retry or check service configuration.',
      },
      500,
    );
  }
}
