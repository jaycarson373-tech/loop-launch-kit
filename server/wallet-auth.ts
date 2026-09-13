import { config, runtime } from './env';
import { assert, json, readJson, sameOrigin } from './http';
import { cookieValue, createSession } from './sessions';
import {
  CHALLENGE_COOKIE,
  CHALLENGE_SECONDS,
  loginMessage,
  verifierHash,
  verifyWalletMessage,
} from '../lib/wallet-login';
import { validAddress } from '../lib/launch';
import { authStatus } from './auth';
type Challenge = {
  id: string;
  wallet: string;
  origin: string;
  message: string;
  browser_hash: string;
  expires_at: number;
};
export async function walletAuth(request: Request, action: string) {
  const env = runtime();
  assert(env.AUTH_MODE === 'password', 404, 'Use the hosted sign-in page.');
  assert(request.method === 'POST', 405, 'Method not allowed.');
  sameOrigin(request);
  assert(
    authStatus().workspaceConfigured,
    503,
    'Workspace setup is incomplete. Configure the database and session secret, then apply migrations.',
  );
  const input = await readJson(request, 4096),
    now = Date.now(),
    origin = new URL(request.url).origin;
  const secure = new URL(origin).protocol === 'https:';
  if (action === 'challenge') {
    assert(
      typeof input.wallet === 'string' && validAddress(input.wallet),
      422,
      'A valid wallet address is required.',
    );
    await env.DB.prepare(
      'DELETE FROM auth_challenges WHERE id IN (SELECT id FROM auth_challenges WHERE expires_at<? LIMIT 500)',
    )
      .bind(now)
      .run();
    const id = crypto.randomUUID(),
      verifier = crypto.randomUUID() + crypto.randomUUID();
    const message = loginMessage(
      origin,
      input.wallet,
      config().chain,
      id.replaceAll('-', ''),
      now,
    );
    const inserted = await env.DB.prepare(
      'INSERT INTO auth_challenges (id,wallet,origin,message,browser_hash,expires_at,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM auth_challenges WHERE wallet=? AND created_at>?)<6 AND (SELECT COUNT(*) FROM auth_challenges WHERE created_at>?)<2000',
    )
      .bind(
        id,
        input.wallet,
        origin,
        message,
        await verifierHash(verifier),
        now + CHALLENGE_SECONDS * 1000,
        now,
        input.wallet,
        now - CHALLENGE_SECONDS * 1000,
        now - CHALLENGE_SECONDS * 1000,
      )
      .run();
    assert(
      inserted.meta.changes === 1,
      429,
      'Too many sign-in requests. Try again in five minutes.',
    );
    const response = json({
      id,
      message,
      expiresAt: now + CHALLENGE_SECONDS * 1000,
    });
    response.headers.set(
      'Set-Cookie',
      `${CHALLENGE_COOKIE}=${verifier}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${CHALLENGE_SECONDS}${secure ? '; Secure' : ''}`,
    );
    return response;
  }
  assert(action === 'verify', 404, 'Endpoint not found.');
  assert(
    typeof input.id === 'string' &&
      input.id.length === 36 &&
      typeof input.signature === 'string',
    400,
    'Sign-in response is invalid.',
  );
  const browser = cookieValue(request, CHALLENGE_COOKIE);
  assert(
    browser && browser.length === 72,
    401,
    'Start sign-in again in this browser.',
  );
  const row = await env.DB.prepare(
    'SELECT * FROM auth_challenges WHERE id=? AND used=0 AND expires_at>? AND origin=? AND browser_hash=?',
  )
    .bind(input.id, now, origin, await verifierHash(browser))
    .first<Challenge>();
  assert(row, 401, 'Sign-in request expired or was already used. Start again.');
  assert(
    await verifyWalletMessage(row.wallet, row.message, input.signature),
    401,
    'Wallet signature was not accepted.',
  );
  const consumed = await env.DB.prepare(
    'UPDATE auth_challenges SET used=1 WHERE id=? AND used=0 AND expires_at>?',
  )
    .bind(row.id, Date.now())
    .run();
  assert(
    consumed.meta.changes === 1,
    401,
    'Sign-in request expired or was already used.',
  );
  const response = json({ ok: true, wallet: row.wallet });
  response.headers.append(
    'Set-Cookie',
    await createSession(request, `wallet:${row.wallet}`),
  );
  response.headers.append(
    'Set-Cookie',
    `${CHALLENGE_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`,
  );
  return response;
}
