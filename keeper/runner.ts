/** An unattended poller; all durable state remains in the authenticated site API. */
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { pollKeeperOnce } from './poller.ts';
const origin = process.env.LOOP_SITE_ORIGIN,
  token = process.env.LOOP_KEEPER_TOKEN;
if (!origin || !token)
  throw new Error('LOOP_SITE_ORIGIN and LOOP_KEEPER_TOKEN are required.');
if (new URL(origin).protocol !== 'https:')
  throw new Error('Use an HTTPS Site origin.');
const controller = new AbortController();
let lastSuccess = 0;
const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid health-check port.');
const server = createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/health') {
    response.writeHead(404);
    response.end();
    return;
  }
  const healthy = lastSuccess > Date.now() - 90000;
  response.writeHead(healthy ? 200 : 503, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify({ healthy, lastSuccess: lastSuccess || null }));
});
server.listen(port, '0.0.0.0');
const stop = () => {
  controller.abort();
  server.close();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
while (!controller.signal.aborted) {
  try {
    const result = await pollKeeperOnce(origin, token, {
      bypass: process.env.LOOP_VERCEL_BYPASS,
      signal: controller.signal,
    });
    lastSuccess = Date.now();
    console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Keeper request failed',
    );
  }
  try {
    await delay(10000, undefined, { signal: controller.signal });
  } catch {
    break;
  }
}
export {};
