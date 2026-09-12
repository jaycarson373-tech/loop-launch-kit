/** An unattended poller; all durable state remains in the authenticated site API. */
const origin = process.env.LOOP_SITE_ORIGIN,
  token = process.env.LOOP_KEEPER_TOKEN;
if (!origin || !token)
  throw new Error('LOOP_SITE_ORIGIN and LOOP_KEEPER_TOKEN are required.');
if (new URL(origin).protocol !== 'https:')
  throw new Error('Use an HTTPS Site origin.');
let stopped = false;
process.on('SIGTERM', () => {
  stopped = true;
});
process.on('SIGINT', () => {
  stopped = true;
});
while (!stopped) {
  try {
    const response = await fetch(new URL('/api/loop/keeper', origin), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(150000),
    });
    const result = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Keeper HTTP ${response.status}`);
    console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Keeper request failed',
    );
  }
  if (!stopped) await new Promise((r) => setTimeout(r, 10000));
}
export {};
