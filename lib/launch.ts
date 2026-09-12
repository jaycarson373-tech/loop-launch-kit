export type LaunchPlan = {
  id: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  payout: string;
  website: string;
  social: string;
  createdAt: string;
  status: 'draft';
  policy: 'standard';
  cluster: 'not-selected';
};
export function validAddress(value: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const c of value) n = n * 58n + BigInt(alphabet.indexOf(c));
  let bytes = 0;
  while (n > 0n) {
    bytes++;
    n >>= 8n;
  }
  return bytes + (value.match(/^1*/)?.[0].length ?? 0) === 32;
}
export function validHttps(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function validatePlan(p: Partial<LaunchPlan>) {
  if (!p.name?.trim() || p.name.trim().length > 32)
    throw new Error('Enter a token name of 1–32 characters.');
  if (!p.symbol || !/^[A-Z0-9]{1,10}$/.test(p.symbol))
    throw new Error('Use 1–10 letters or numbers for the symbol.');
  if ((p.description?.length ?? 0) > 500)
    throw new Error('Keep the description under 500 characters.');
  if (p.payout && !validAddress(p.payout))
    throw new Error('Enter a valid public Solana payout address.');
  for (const key of ['website', 'social'] as const)
    if (p[key] && !validHttps(p[key]!))
      throw new Error('Links must be valid HTTPS addresses.');
  if (
    p.image &&
    !validHttps(p.image) &&
    !/^data:image\/(png|jpeg|webp);base64,/.test(p.image)
  )
    throw new Error('Choose a PNG, JPEG, WebP image or an HTTPS image URL.');
  return p;
}
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportPlan(plan: LaunchPlan) {
  downloadJson(`${plan.symbol.toLowerCase()}-launch-plan.json`, {
    ...plan,
    metadata: {
      name: plan.name,
      symbol: plan.symbol,
      description: plan.description,
      image: plan.image,
      external_url: plan.website,
    },
    execution: {
      enabled: false,
      cluster: null,
      mint: null,
      treasury: null,
      allocationBps: { buyback: 7000, creator: 1000, platform: 2000 },
      dipBps: 5000,
      rollingWindowMinutes: 20,
      lotBps: 250,
      minimumLotSol: 0.05,
      batchSize: 4,
      batchSpacingSeconds: 2,
      slippageBps: 100,
    },
    note: 'A launch plan, not an on-chain launch. Uploaded artwork must be hosted and transaction infrastructure configured before use.',
  });
}
