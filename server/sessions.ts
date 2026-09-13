import { runtime } from './env';
import {
  issueSession,
  readSession,
  SESSION_COOKIE,
  sessionCookie,
} from '../lib/session';
export function cookieValue(request: Request, name: string) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export async function currentSession(request: Request) {
  const value = cookieValue(request, SESSION_COOKIE),
    env = runtime();
  if (!value || !env.LOOP_SESSION_SECRET) return null;
  const signed = await readSession(
    value,
    env.LOOP_SESSION_SECRET,
    new URL(request.url).origin,
  );
  if (!signed) return null;
  const row = await env.DB.prepare(
    'SELECT id FROM auth_sessions WHERE id=? AND owner=? AND expires_at>?',
  )
    .bind(signed.id, signed.subject, Date.now())
    .first();
  return row ? signed : null;
}
export async function createSession(request: Request, subject: string) {
  const env = runtime(),
    origin = new URL(request.url).origin;
  const token = await issueSession(
    env.LOOP_SESSION_SECRET!,
    origin,
    Date.now(),
    subject,
  );
  const parsed = (await readSession(token, env.LOOP_SESSION_SECRET!, origin))!;
  await env.DB.prepare(
    'DELETE FROM auth_sessions WHERE id IN (SELECT id FROM auth_sessions WHERE expires_at<? LIMIT 500)',
  )
    .bind(Date.now())
    .run();
  await env.DB.prepare(
    'INSERT INTO auth_sessions (id,owner,expires_at) VALUES (?,?,?)',
  )
    .bind(parsed.id, subject, parsed.expires)
    .run();
  return sessionCookie(token, new URL(request.url).protocol === 'https:');
}
