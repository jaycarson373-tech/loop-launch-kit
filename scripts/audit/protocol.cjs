// Read-only transaction simulation on a local devnet fork. No signing or broadcasting.
// Post-simulation account state is applied using local Surfpool cheatcodes only.
const {
  PUMP_SDK,
  OnlinePumpSdk,
  getBuyTokenAmountFromSolAmount,
} = require('@pump-fun/pump-sdk');
const {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  SystemProgram,
  ComputeBudgetProgram,
  TransactionInstruction,
} = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createBurnCheckedInstruction,
} = require('@solana/spl-token');
const BN = require('bn.js');
const { generateKeyPairSync } = require('node:crypto');
const assert = require('node:assert/strict');
const publicKey = () =>
  new PublicKey(
    Buffer.from(
      generateKeyPairSync('ed25519').publicKey.export({ format: 'jwk' }).x,
      'base64url',
    ),
  );
(async () => {
  const endpoint = 'http://127.0.0.1:8988',
    rpc = new Connection(endpoint, 'confirmed');
  const user = publicKey(),
    mint = publicKey(),
    creator = publicKey();
  async function cheat(address, value) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'surfnet_setAccount',
        params: [address, value],
      }),
    });
    const local = await response.json();
    assert.equal(
      local.error,
      undefined,
      'A local Surfpool with cheatcodes is required.',
    );
  }
  await cheat(user.toBase58(), {
    lamports: 100_000_000_000,
    owner: SystemProgram.programId.toBase58(),
  });
  async function simulate(label, payer, ixs, apply = false) {
    const lifetime = await rpc.getLatestBlockhash();
    const tx = new Transaction({
      feePayer: payer,
      blockhash: lifetime.blockhash,
      lastValidBlockHeight: lifetime.lastValidBlockHeight,
    }).add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }), ...ixs);
    const wire = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    assert.ok(wire.length <= 1232, `${label} exceeds packet size`);
    const addresses = [
      ...new Set([
        payer.toBase58(),
        ...ixs.flatMap((ix) =>
          ix.keys.filter((k) => k.isWritable).map((k) => k.pubkey.toBase58()),
        ),
      ]),
    ];
    const sim = await rpc.simulateTransaction(
      VersionedTransaction.deserialize(wire),
      {
        sigVerify: false,
        commitment: 'confirmed',
        accounts: { encoding: 'base64', addresses },
      },
    );
    console.log(
      JSON.stringify(
        {
          flow: label,
          packetBytes: wire.length,
          units: sim.value.unitsConsumed,
          error: sim.value.err,
          logs: sim.value.err ? sim.value.logs?.slice(-10) : undefined,
        },
        null,
        2,
      ),
    );
    assert.equal(sim.value.err, null, `${label} simulation failed.`);
    if (apply)
      for (let i = 0; i < addresses.length; i++) {
        const a = sim.value.accounts[i];
        if (a)
          await cheat(addresses[i], {
            lamports: a.lamports,
            owner: a.owner,
            data: Buffer.from(a.data[0], 'base64').toString('hex'),
            executable: a.executable,
          });
      }
    return sim;
  }
  const create = await PUMP_SDK.createV2Instruction({
    mint,
    name: 'Loop protocol test',
    symbol: 'LOOPTEST',
    uri: 'https://example.com/loop-test.json',
    creator,
    user,
    mayhemMode: false,
    cashback: false,
  });
  await simulate(
    'Pump create_v2 plus creator funding',
    user,
    [
      SystemProgram.transfer({
        fromPubkey: user,
        toPubkey: creator,
        lamports: 10_000_000,
      }),
      create,
    ],
    true,
  );
  // Only local fake SOL is added for the buyback test.
  await cheat(creator.toBase58(), {
    lamports: 1_000_000_000,
    owner: SystemProgram.programId.toBase58(),
  });
  const sdk = new OnlinePumpSdk(rpc),
    state = await sdk.fetchBuyState(mint, creator, TOKEN_2022_PROGRAM_ID),
    global = await sdk.fetchGlobal(),
    feeConfig = await sdk.fetchFeeConfig();
  const quote = new BN(50_000_000).muln(10000).divn(10100),
    amount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: new BN('1000000000000000'),
      bondingCurve: state.bondingCurve,
      amount: quote,
      quoteMint: NATIVE_MINT,
    });
  const buy = await PUMP_SDK.buyInstructions({
    global,
    ...state,
    mint,
    user: creator,
    amount,
    solAmount: quote,
    slippage: 1,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });
  buy.push(
    new TransactionInstruction({
      programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      keys: [],
      data: Buffer.from('loop:00000000-0000-4000-8000-000000000000:lot-1'),
    }),
  );
  buy.push(
    createBurnCheckedInstruction(
      getAssociatedTokenAddressSync(
        mint,
        creator,
        false,
        TOKEN_2022_PROGRAM_ID,
      ),
      mint,
      creator,
      BigInt(amount.toString()),
      6,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  await simulate(
    'Bonding curve buy plus exact atomic burn',
    creator,
    buy,
    true,
  );
  const claim = await sdk.collectCoinCreatorFeeInstructions(creator, creator);
  await simulate(
    'Creator fee collection from both programs',
    creator,
    claim,
    true,
  );
  await simulate('Creator payout', creator, [
    SystemProgram.transfer({
      fromPubkey: creator,
      toPubkey: user,
      lamports: 1000000,
    }),
  ]);
  const finalState = await sdk.fetchBuyState(mint, user, TOKEN_2022_PROGRAM_ID);
  const graduate = await PUMP_SDK.buyInstructions({
    global,
    ...finalState,
    mint,
    user,
    amount: finalState.bondingCurve.realTokenReserves,
    solAmount: new BN(90000000000),
    slippage: 0,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });
  await simulate(
    'Complete bonding curve for migration fixture',
    user,
    graduate,
    true,
  );
  const migrate = await PUMP_SDK.migrateInstruction({
    withdrawAuthority: global.withdrawAuthority,
    mint,
    user,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });
  await simulate(
    'Curve migration to canonical PumpSwap pool',
    user,
    [migrate],
    true,
  );
  const { canonicalPumpPoolPda } = require('@pump-fun/pump-sdk');
  const {
    OnlinePumpAmmSdk,
    PUMP_AMM_SDK,
    buyQuoteInput,
  } = require('@pump-fun/pump-swap-sdk');
  const amm = new OnlinePumpAmmSdk(rpc),
    swap = await amm.swapSolanaState(canonicalPumpPoolPda(mint), creator);
  const q = buyQuoteInput({
    quote,
    slippage: 0,
    baseReserve: swap.poolBaseAmount,
    quoteReserve: swap.poolQuoteAmount,
    virtualQuoteReserves: swap.pool.virtualQuoteReserves,
    globalConfig: swap.globalConfig,
    baseMintAccount: swap.baseMintAccount,
    baseMint: swap.pool.baseMint,
    coinCreator: swap.pool.coinCreator,
    creator: swap.pool.creator,
    feeConfig: swap.feeConfig,
    quoteMint: swap.pool.quoteMint,
    isMayhemMode: swap.pool.isMayhemMode,
    creatorFeeBps: swap.pool.creatorFeeBps,
  });
  const ammBuy = await PUMP_AMM_SDK.buyInstructions(
    swap,
    q.base,
    new BN(50000000),
  );
  ammBuy.push(
    new TransactionInstruction({
      programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      keys: [],
      data: Buffer.from('loop:00000000-0000-4000-8000-000000000000:lot-2'),
    }),
  );
  ammBuy.push(
    createBurnCheckedInstruction(
      getAssociatedTokenAddressSync(
        mint,
        creator,
        false,
        TOKEN_2022_PROGRAM_ID,
      ),
      mint,
      creator,
      BigInt(q.base.toString()),
      6,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  await simulate('PumpSwap buy plus atomic burn', creator, ammBuy);
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
