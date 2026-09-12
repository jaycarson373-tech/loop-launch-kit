import { config, runtime } from './env';
import { db } from './store';
import { verifyPrograms } from './pump-adapter';
import { signerRequest } from './signer';
import { keeperIsRecent } from '../lib/runtime-config';
import { POLICY } from '../lib/buybacks';
export type ReadinessCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};
export async function serviceReadiness() {
  const c = config(),
    checks: ReadinessCheck[] = [];
  const check = async (
    id: string,
    label: string,
    run: () => Promise<string>,
  ) => {
    try {
      checks.push({ id, label, ok: true, detail: await run() });
    } catch {
      checks.push({
        id,
        label,
        ok: false,
        detail: 'Check failed. Review this service configuration.',
      });
    }
  };
  checks.push({
    id: 'configuration',
    label: 'Execution settings',
    ok: c.configured,
    detail: c.configured
      ? 'Required settings are valid.'
      : `Missing: ${c.missing.join(', ') || 'none'}. Invalid: ${c.invalid.join(', ') || 'none'}.`,
  });
  await check('database', 'Launch database', async () => {
    await db().prepare('SELECT id FROM launches LIMIT 1').all();
    return 'Database responds.';
  });
  await check('artwork', 'Artwork storage', async () => {
    await runtime().ASSETS.head('__loop_readiness__');
    return 'Artwork storage responds.';
  });
  let heartbeat: number | null = null;
  try {
    const beat = await db()
      .prepare("SELECT value FROM settings WHERE key='keeper_heartbeat'")
      .first<{ value: string }>();
    heartbeat = beat ? Number(beat.value) : null;
  } catch {}
  checks.push({
    id: 'keeper',
    label: 'Keeper heartbeat',
    ok: keeperIsRecent(heartbeat),
    detail: keeperIsRecent(heartbeat)
      ? 'Keeper contacted this deployment within 90 seconds.'
      : 'No recent keeper heartbeat. Automatic execution is unavailable.',
  });
  if (c.configured) {
    await check('rpc', 'Network and Pump programs', async () => {
      await verifyPrograms();
      return `RPC matches ${c.cluster}; both Pump programs are executable.`;
    });
    await check('signer', 'Managed signer and treasury key', async () => {
      const h = await signerRequest('/v1/health', {});
      if (
        !h.ok ||
        h.treasury !== c.treasury ||
        Number(h.policyVersion) !== 1 ||
        BigInt(h.maxBuyLamports) < POLICY.maxLot ||
        BigInt(h.maxTransferLamports) < POLICY.maxPayout
      )
        throw new Error('Signer policy mismatch');
      return 'Key access, treasury identity and spending limits match.';
    });
  } else
    for (const [id, label] of [
      ['rpc', 'Network and Pump programs'],
      ['signer', 'Managed signer and treasury key'],
    ])
      checks.push({
        id,
        label,
        ok: false,
        detail: 'Configure required services before this check can run.',
      });
  return {
    checkedAt: new Date().toISOString(),
    servicesReady: checks.every((x) => x.ok),
    executionEnabled: c.launchEnabled,
    checks,
    acceptance:
      'A complete launch, fee claim, payout, buy and burn acceptance run is still required before enabling real funds.',
  };
}
