// The official Pump SDK currently requires web3.js v1. Legacy objects stay in this adapter.
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  SystemProgram,
  ComputeBudgetProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  PUMP_SDK,
  OnlinePumpSdk,
  getBuyTokenAmountFromSolAmount,
  canonicalPumpPoolPda,
  PUMP_PROGRAM_ID,
  PUMP_AMM_PROGRAM_ID,
  getPumpProgram,
  getPumpAmmProgram,
} from '@pump-fun/pump-sdk';
import {
  OnlinePumpAmmSdk,
  PUMP_AMM_SDK,
  buyQuoteInput,
} from '@pump-fun/pump-swap-sdk';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
  getMint,
  getExtensionTypes,
  ExtensionType,
  getAssociatedTokenAddressSync,
  createBurnCheckedInstruction,
} from '@solana/spl-token';
import BN from 'bn.js';
import { EventParser } from '@coral-xyz/anchor';
import { rpcUrl, config } from './env';
import { assert } from './http';
import type { LaunchRow } from './store';
export const connection = () =>
  new Connection(rpcUrl(), {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true,
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(12000) }),
  });
export async function verifyNetwork() {
  const genesis = await connection().getGenesisHash();
  const expected =
    config().cluster === 'mainnet-beta'
      ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
      : 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
  assert(
    genesis === expected,
    503,
    'RPC network does not match the configured wallet network.',
  );
}
export const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
export const from64 = (value: string) => Buffer.from(value, 'base64');
export type Prepared = {
  unsigned: string;
  blockHeight: number;
  feeLamports: string;
  simulation: { unitsConsumed: number | null; logs: string[] };
  details: Record<string, unknown>;
};
async function pack(
  payer: string,
  ixs: TransactionInstruction[],
  details: Record<string, unknown>,
): Promise<Prepared> {
  await verifyNetwork();
  const c = connection(),
    lifetime = await c.getLatestBlockhash('confirmed');
  const tx = new Transaction({
    feePayer: new PublicKey(payer),
    blockhash: lifetime.blockhash,
    lastValidBlockHeight: lifetime.lastValidBlockHeight,
  }).add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }), ...ixs);
  const raw = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  assert(
    raw.length <= 1232,
    422,
    'Transaction exceeds the network packet limit.',
  );
  const before = await c.getBalance(new PublicKey(payer), 'confirmed');
  const sim = await c.simulateTransaction(
    VersionedTransaction.deserialize(raw),
    {
      sigVerify: false,
      commitment: 'confirmed',
      accounts: { encoding: 'base64', addresses: [payer] },
    },
  );
  assert(
    !sim.value.err,
    422,
    `Transaction simulation failed: ${JSON.stringify(sim.value.err)}. ${sim.value.logs?.slice(-3).join(' ') || ''}`,
  );
  const fee = await c.getFeeForMessage(tx.compileMessage(), 'confirmed');
  assert(fee.value !== null, 503, 'Network fee quote unavailable.');
  return {
    unsigned: b64(raw),
    blockHeight: lifetime.lastValidBlockHeight,
    feeLamports: String(fee.value),
    simulation: {
      unitsConsumed: sim.value.unitsConsumed ?? null,
      logs: sim.value.logs ?? [],
    },
    details: {
      ...details,
      blockhash: lifetime.blockhash,
      estimatedWalletDebitLamports: String(
        Math.max(0, before - (sim.value.accounts?.[0]?.lamports ?? before)),
      ),
    },
  };
}
export async function prepareCreate(row: LaunchRow, mint: string, uri: string) {
  assert(row.creator, 409, 'Creator vault is not ready.');
  const plan = JSON.parse(row.plan),
    payer = new PublicKey(row.wallet);
  const ix = await PUMP_SDK.createV2Instruction({
    mint: new PublicKey(mint),
    name: plan.name,
    symbol: plan.symbol,
    uri,
    creator: new PublicKey(row.creator),
    user: payer,
    mayhemMode: false,
    cashback: false,
  });
  const funding = 10_000_000;
  return pack(
    row.wallet,
    [
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: new PublicKey(row.creator),
        lamports: funding,
      }),
      ix,
    ],
    {
      kind: 'create',
      mint,
      creator: row.creator,
      payer: row.wallet,
      vaultFundingLamports: String(funding),
      metadataUri: uri,
      cluster: config().cluster,
    },
  );
}
async function token(mint: PublicKey) {
  const c = connection(),
    info = await c.getAccountInfo(mint);
  assert(
    info &&
      (info.owner.equals(TOKEN_PROGRAM_ID) ||
        info.owner.equals(TOKEN_2022_PROGRAM_ID)),
    422,
    'Unsupported token program.',
  );
  const state = await getMint(c, mint, 'confirmed', info.owner);
  const allowed = [ExtensionType.MetadataPointer, ExtensionType.TokenMetadata];
  assert(
    getExtensionTypes(state.tlvData).every((x) => allowed.includes(x)),
    422,
    'This token has extensions incompatible with exact buy-and-burn.',
  );
  return { program: info.owner, state };
}
export async function market(row: LaunchRow, payer = row.creator!) {
  await verifyNetwork();
  assert(row.mint && row.creator, 409, 'Token has not launched.');
  const c = connection(),
    mint = new PublicKey(row.mint),
    user = new PublicKey(payer),
    t = await token(mint),
    sdk = new OnlinePumpSdk(c),
    curve = await sdk.fetchBuyState(mint, user, t.program);
  assert(
    curve.bondingCurveAccountInfo.owner.equals(PUMP_PROGRAM_ID),
    422,
    'Incorrect bonding curve owner.',
  );
  assert(
    curve.bondingCurve.creator.equals(new PublicKey(row.creator)),
    422,
    'Token creator no longer matches its vault.',
  );
  assert(
    curve.quoteMint.equals(NATIVE_MINT),
    422,
    'Only SOL-paired tokens are supported.',
  );
  if (!curve.bondingCurve.complete) {
    const price =
      Number(curve.bondingCurve.virtualQuoteReserves.toString()) /
      Number(curve.bondingCurve.virtualTokenReserves.toString());
    return { venue: 'curve' as const, price, curve, t, mint, user, sdk };
  }
  const poolKey = canonicalPumpPoolPda(mint),
    amm = new OnlinePumpAmmSdk(c),
    swap = await amm.swapSolanaState(poolKey, user);
  assert(
    swap.poolAccountInfo?.owner.equals(PUMP_AMM_PROGRAM_ID) &&
      swap.pool.baseMint.equals(mint) &&
      swap.pool.quoteMint.equals(NATIVE_MINT) &&
      swap.pool.coinCreator.equals(new PublicKey(row.creator)),
    422,
    'Canonical PumpSwap pool could not be verified.',
  );
  const effective = swap.poolQuoteAmount.add(
    swap.pool.virtualQuoteReserves || new BN(0),
  );
  const price =
    Number(effective.toString()) / Number(swap.poolBaseAmount.toString());
  return { venue: 'pumpswap' as const, price, swap, t, mint, user, sdk };
}
export async function prepareBuy(
  row: LaunchRow,
  purchase: bigint,
  stream: 'dip' | 'treasury',
  lotId: string,
) {
  const payer = stream === 'treasury' ? config().treasury : row.creator;
  assert(payer, 503, 'Execution wallet not configured.');
  const m = await market(row, payer);
  let amount: BN, ixs: TransactionInstruction[];
  const ceiling = new BN(purchase.toString()),
    quoted = ceiling.muln(10000).divn(10100);
  if (m.venue === 'curve') {
    const [global, feeConfig] = await Promise.all([
      m.sdk.fetchGlobal(),
      m.sdk.fetchFeeConfig(),
    ]);
    amount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: new BN(m.t.state.supply.toString()),
      bondingCurve: m.curve.bondingCurve,
      amount: quoted,
      quoteMint: NATIVE_MINT,
    });
    assert(amount.gtn(0), 422, 'Buy amount rounds to zero.');
    ixs = await PUMP_SDK.buyInstructions({
      global,
      ...m.curve,
      mint: m.mint,
      user: m.user,
      amount,
      solAmount: quoted,
      slippage: 1,
      tokenProgram: m.t.program,
    });
  } else {
    const s = m.swap,
      q = buyQuoteInput({
        quote: quoted,
        slippage: 0,
        baseReserve: s.poolBaseAmount,
        quoteReserve: s.poolQuoteAmount,
        virtualQuoteReserves: s.pool.virtualQuoteReserves,
        globalConfig: s.globalConfig,
        baseMintAccount: s.baseMintAccount,
        baseMint: s.pool.baseMint,
        coinCreator: s.pool.coinCreator,
        creator: s.pool.creator,
        feeConfig: s.feeConfig,
        quoteMint: s.pool.quoteMint,
        isMayhemMode: s.pool.isMayhemMode,
        creatorFeeBps: s.pool.creatorFeeBps,
      });
    amount = q.base;
    assert(amount.gtn(0), 422, 'Buy amount rounds to zero.');
    ixs = await PUMP_AMM_SDK.buyInstructions(s, amount, ceiling);
  }
  assert(/^lot-\d+$/.test(lotId), 422, 'Lot identifier is required.');
  ixs.push(
    new TransactionInstruction({
      programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      keys: [],
      data: Buffer.from(`loop:${row.id}:${lotId}`),
    }),
  );
  const ata = getAssociatedTokenAddressSync(m.mint, m.user, false, m.t.program);
  ixs.push(
    createBurnCheckedInstruction(
      ata,
      m.mint,
      m.user,
      BigInt(amount.toString()),
      m.t.state.decimals,
      [],
      m.t.program,
    ),
  );
  const prepared = await pack(payer, ixs, {
    kind: 'buyback',
    payer,
    mint: row.mint,
    creator: row.creator,
    purchaseCeiling: purchase.toString(),
    burnAmount: amount.toString(),
    tokenAccount: ata.toBase58(),
    tokenProgram: m.t.program.toBase58(),
    venue: m.venue,
    stream,
  });
  return prepared;
}
export async function prepareClaim(row: LaunchRow) {
  assert(row.creator, 409, 'Creator vault missing.');
  const sdk = new OnlinePumpSdk(connection()),
    payer = new PublicKey(row.creator),
    balance = await sdk.getCreatorVaultBalanceBothPrograms(payer);
  if (balance.ltn(100000)) return null;
  const ixs = await sdk.collectCoinCreatorFeeInstructions(payer, payer);
  return pack(row.creator, ixs, {
    kind: 'claim',
    payer: row.creator,
    available: balance.toString(),
  });
}
export async function prepareTransfer(
  payer: string,
  recipient: string,
  value: bigint,
  kind: string,
) {
  assert(
    payer !== recipient,
    422,
    'Transfer source and destination must differ.',
  );
  return pack(
    payer,
    [
      SystemProgram.transfer({
        fromPubkey: new PublicKey(payer),
        toPubkey: new PublicKey(recipient),
        lamports: value,
      }),
    ],
    { kind, payer, recipient, amount: value.toString() },
  );
}
export function verifySigned(unsigned: string, signed: string) {
  const expected = Transaction.from(from64(unsigned)),
    tx = Transaction.from(from64(signed));
  assert(
    tx.serializeMessage().equals(expected.serializeMessage()),
    422,
    'Wallet changed the reviewed transaction. Prepare a fresh review.',
  );
  assert(
    tx.verifySignatures(),
    422,
    'Transaction signatures are invalid or incomplete.',
  );
  assert(tx.signature, 422, 'Fee payer signature is missing.');
  return { raw: tx.serialize(), signature: base58(tx.signature) };
}
export function base58(bytes: Uint8Array) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = BigInt('0x' + Buffer.from(bytes).toString('hex'));
  let out = '';
  while (n) {
    out = alphabet[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}
export async function receipt(
  signature: string,
  details: Record<string, any>,
  unsigned: string,
) {
  await verifyNetwork();
  const tx = await connection().getTransaction(signature, {
    commitment: 'finalized',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return null;
  assert(tx.meta, 503, 'Transaction receipt has no balance metadata.');
  const keys = tx.transaction.message.getAccountKeys({
    accountKeysFromLookups: tx.meta.loadedAddresses,
  });
  const index = Array.from({ length: keys.length }, (_, i) =>
    keys.get(i)?.toBase58(),
  ).indexOf(details.payer);
  assert(index >= 0, 422, 'Receipt payer does not match.');
  const before = BigInt(tx.meta.preBalances[index]),
    after = BigInt(tx.meta.postBalances[index]),
    fee = BigInt(tx.meta.fee);
  let burned = 0n;
  assert(
    Buffer.from(tx.transaction.message.serialize()).equals(
      Transaction.from(from64(unsigned)).serializeMessage(),
    ),
    422,
    'Confirmed message differs from the recorded transaction.',
  );
  // The exact compiled message is independently compared during submission. Its burn instruction is atomic.
  if (!tx.meta.err && details.burnAmount) burned = BigInt(details.burnAmount);
  let received = 0n;
  if (details.recipient) {
    const ri = Array.from({ length: keys.length }, (_, i) =>
      keys.get(i)?.toBase58(),
    ).indexOf(details.recipient);
    assert(ri >= 0, 422, 'Receipt destination does not match.');
    received =
      BigInt(tx.meta.postBalances[ri]) - BigInt(tx.meta.preBalances[ri]);
  }
  let claimed = 0n;
  if (!tx.meta.err && details.kind === 'claim') {
    const c = connection();
    const programs = [getPumpProgram(c), getPumpAmmProgram(c)];
    const events: any[] = [];
    for (const group of tx.meta.innerInstructions || [])
      for (const instruction of group.instructions) {
        const program = programs.find((p) =>
          p.programId.equals(keys.get(instruction.programIdIndex)!),
        );
        if (!program) continue;
        const raw = decode58(instruction.data);
        if (raw.subarray(0, 8).toString('hex') !== 'e445a52e51cb9a1d') continue;
        const event = program.coder.events.decode(
          raw.subarray(8).toString('base64'),
        );
        if (event) events.push(event);
      }
    if (!events.length)
      for (const program of programs)
        for (const event of new EventParser(
          program.programId,
          program.coder,
        ).parseLogs(tx.meta.logMessages || []))
          events.push(event);
    for (const event of events) {
      const d = event.data;
      if (
        event.name === 'collectCreatorFeeEvent' &&
        String(d.creator) === details.payer
      )
        claimed += BigInt(String(d.creatorFee));
      if (
        event.name === 'collectCoinCreatorFeeEvent' &&
        String(d.coinCreator) === details.payer
      )
        claimed += BigInt(String(d.coinCreatorFee));
    }
    assert(
      claimed > 0n,
      422,
      'Claim receipt has no verified creator-fee event.',
    );
  }
  return {
    claimed,
    netDelta: after - before,
    failed: !!tx.meta.err,
    error: tx.meta.err,
    debit: before > after ? before - after : 0n,
    income: after - before + fee,
    fee,
    burned,
    received,
    slot: tx.slot,
  };
}
export async function sendSigned(raw: Uint8Array) {
  await verifyNetwork();
  return connection().sendRawTransaction(raw, {
    skipPreflight: false,
    maxRetries: 0,
    preflightCommitment: 'confirmed',
  });
}
export async function assertLifetime(blockHeight: number) {
  assert(
    (await connection().getBlockHeight('confirmed')) <= blockHeight,
    409,
    'The quote expired. Prepare a new transaction before signing.',
  );
}

export function decode58(value: string) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const c of value) {
    const i = alphabet.indexOf(c);
    assert(i >= 0, 422, 'Invalid base58 data.');
    n = n * 58n + BigInt(i);
  }
  let h = n.toString(16);
  if (h.length % 2) h = '0' + h;
  const zeros = value.match(/^1*/)?.[0].length || 0;
  return Buffer.concat([
    Buffer.alloc(zeros),
    n ? Buffer.from(h, 'hex') : Buffer.alloc(0),
  ]);
}

export async function verifyPrograms() {
  await verifyNetwork();
  const programs = await connection().getMultipleAccountsInfo([
    PUMP_PROGRAM_ID,
    PUMP_AMM_PROGRAM_ID,
  ]);
  assert(
    programs.every((p) => p?.executable),
    503,
    'Pump programs are unavailable on this network.',
  );
}
