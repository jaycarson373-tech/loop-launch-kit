export async function pollKeeperOnce(
  origin: string,
  token: string,
  options: {
    bypass?: string;
    signal?: AbortSignal;
    fetcher?: typeof fetch;
  } = {},
) {
  const url = new URL(origin);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'LOOP_SITE_ORIGIN must be an HTTPS origin without credentials or a path.',
    );
  if (token.length < 32)
    throw new Error('Keeper token must contain at least 32 characters.');
  const response = await (options.fetcher ?? fetch)(
    new URL('/api/loop/keeper', url),
    {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.bypass
          ? { 'x-vercel-protection-bypass': options.bypass }
          : {}),
      },
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(150000)])
        : AbortSignal.timeout(150000),
    },
  );
  if (!response.ok) throw new Error(`Keeper HTTP ${response.status}`);
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== 'object' ||
    !('results' in result) ||
    !Array.isArray(result.results)
  )
    throw new Error(
      'Keeper returned an unexpected response. Check the deployment URL and access settings.',
    );
  return result;
}
