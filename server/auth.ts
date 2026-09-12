import { assert, json, readJson, sameOrigin } from './http';
import { runtime } from './env';
import { issueSession, passwordMatches, sessionCookie } from '../lib/session';

export function authStatus() {
  const env = runtime();
  return {
    signInUrl:
      env.AUTH_MODE === 'sites'
        ? '/signin-with-chatgpt?return_to=/'
        : '/signin',
    workspaceConfigured:
      env.AUTH_MODE === 'sites' ||
      !!(
        env.TURSO_DATABASE_URL &&
        (env.LOOP_ADMIN_PASSWORD?.length ?? 0) >= 32 &&
        (env.LOOP_SESSION_SECRET?.length ?? 0) >= 32 &&
        env.LOOP_ADMIN_PASSWORD !== env.LOOP_SESSION_SECRET
      ),
  };
}
export async function sessionRoute(request: Request) {
  const env = runtime();
  assert(env.AUTH_MODE === 'password', 404, 'Use the hosted sign-in page.');
  sameOrigin(request);
  const secure = new URL(request.url).protocol === 'https:';
  if (request.method === 'DELETE') {
    const response = json({ ok: true });
    response.headers.set('Set-Cookie', sessionCookie('', secure, 0));
    return response;
  }
  assert(request.method === 'POST', 405, 'Method not allowed.');
  assert(
    authStatus().workspaceConfigured,
    503,
    'Workspace setup is incomplete. Add the database and login settings in Vercel, then run the database migration.',
  );
  const input = await readJson(request, 2048);
  assert(
    typeof input.password === 'string' && input.password.length <= 512,
    400,
    'Enter your workspace password.',
  );
  // Shared across Vercel instances; never use an in-memory rate limiter.
  const bucket = Math.floor(Date.now() / 900000);
  const attempt = await env.DB.prepare(
    "INSERT INTO settings (key,value) VALUES ('login_attempts',?) ON CONFLICT(key) DO UPDATE SET value=CASE WHEN json_extract(settings.value,'$.bucket')=? THEN json_set(settings.value,'$.count',json_extract(settings.value,'$.count')+1) ELSE excluded.value END RETURNING value",
  )
    .bind(JSON.stringify({ bucket, count: 1 }), bucket)
    .first<{ value: string }>();
  assert(
    attempt && JSON.parse(attempt.value).count <= 30,
    429,
    'Too many sign-in attempts. Try again in 15 minutes.',
  );
  assert(
    await passwordMatches(input.password, env.LOOP_ADMIN_PASSWORD!),
    401,
    'Incorrect workspace password.',
  );
  const response = json({ ok: true });
  response.headers.set(
    'Set-Cookie',
    sessionCookie(
      await issueSession(env.LOOP_SESSION_SECRET!, new URL(request.url).origin),
      secure,
    ),
  );
  return response;
}
