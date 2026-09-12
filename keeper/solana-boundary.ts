// Isolated compatibility boundary for Pump's legacy transaction format.
import {
  PublicKey,
  Transaction,
  SystemProgram,
  SystemInstruction,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const AMM = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const COMPUTE = 'ComputeBudget111111111111111111111111111111';
const BUY = '66063d1201daebea',
  CLAIM = '1416567bc61cdb84',
  AMM_CLAIM = 'a039592ab58b2b42',
  EXTEND = 'ea66c2cb96483ee5';
function requirePolicy(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const key = (ix: TransactionInstruction, index: number) =>
  ix.keys[index]?.pubkey;
export function publicAddress(raw: Uint8Array) {
  return new PublicKey(raw).toBase58();
}
export function reviewSigningPayload(
  encoded: string,
  address: string,
  destinations: string[],
) {
  const tx = Transaction.from(Buffer.from(encoded, 'base64')),
    owner = new PublicKey(address),
    wsol = getAssociatedTokenAddressSync(NATIVE_MINT, owner);
  requirePolicy(
    tx.feePayer?.equals(owner),
    'Fee payer must match the selected managed wallet.',
  );
  requirePolicy(
    tx.signatures.length === 1,
    'Managed transactions must have exactly one signer.',
  );
  const pump = tx.instructions.filter(
    (ix) => ix.programId.equals(PUMP) || ix.programId.equals(AMM),
  );
  const buys = pump.filter(
    (ix) => ix.data.subarray(0, 8).toString('hex') === BUY,
  );
  requirePolicy(buys.length <= 1, 'Only one buy is permitted per transaction.');
  const buy = buys[0],
    amm = buy?.programId.equals(AMM),
    mint = buy ? key(buy, amm ? 3 : 2) : undefined;
  const tokenProgram = buy ? key(buy, amm ? 11 : 8) : undefined;
  const maxSpend = BigInt(process.env.LOOP_MAX_BUY_LAMPORTS || '1000000000');
  if (buy) {
    requirePolicy(
      buy.data.length >= 24 &&
        buy.data.readBigUInt64LE(8) > 0n &&
        buy.data.readBigUInt64LE(16) <= maxSpend,
      'Buy exceeds the managed wallet limit.',
    );
    requirePolicy(
      key(buy, amm ? 1 : 6)?.equals(owner),
      'Buy authority must be the managed wallet.',
    );
    requirePolicy(
      tokenProgram?.equals(TOKEN_PROGRAM_ID) ||
        tokenProgram?.equals(TOKEN_2022_PROGRAM_ID),
      'Unsupported buy token program.',
    );
    if (amm)
      requirePolicy(
        key(buy, 4)?.equals(NATIVE_MINT) &&
          key(buy, 12)?.equals(TOKEN_PROGRAM_ID),
        'Only SOL quote pools are permitted.',
      );
  }
  const ata =
    mint && tokenProgram
      ? getAssociatedTokenAddressSync(mint, owner, false, tokenProgram)
      : undefined;
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('creator_vault'), owner.toBuffer()],
    AMM,
  );
  const vaultAta = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    vaultAuthority,
    true,
  );
  let memos = 0;
  let burns = 0,
    transfers = 0;
  for (const ix of tx.instructions) {
    const program = ix.programId.toBase58();
    if (program === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') {
      requirePolicy(
        buy &&
          ix.keys.length === 0 &&
          /^loop:[0-9a-f-]{36}:lot-\d+$/.test(ix.data.toString()) &&
          ix.data.length <= 80 &&
          ++memos === 1,
        'Only one Loop lot memo is permitted.',
      );
      continue;
    }
    if (program === COMPUTE) {
      requirePolicy(
        (ix.data[0] === 2 &&
          ix.data.length === 5 &&
          ix.data.readUInt32LE(1) <= 400000) ||
          (ix.data[0] === 3 &&
            ix.data.length === 9 &&
            ix.data.readBigUInt64LE(1) <= 10000n),
        'Unsupported or excessive compute fee.',
      );
      continue;
    }
    if (ix.programId.equals(PUMP) || ix.programId.equals(AMM)) {
      const discriminator = ix.data.subarray(0, 8).toString('hex');
      if (discriminator === BUY) {
        requirePolicy(
          ix === buy && key(ix, amm ? 5 : 5)?.equals(ata!),
          'Buy must deliver to the managed token account.',
        );
      } else if (ix.programId.equals(PUMP) && discriminator === CLAIM) {
        requirePolicy(
          !buy && key(ix, 0)?.equals(owner),
          'Claim must pay the managed creator.',
        );
      } else if (ix.programId.equals(AMM) && discriminator === AMM_CLAIM) {
        requirePolicy(
          !buy &&
            key(ix, 2)?.equals(owner) &&
            key(ix, 0)?.equals(NATIVE_MINT) &&
            key(ix, 1)?.equals(TOKEN_PROGRAM_ID) &&
            key(ix, 5)?.equals(wsol),
          'Claim must pay the managed SOL account.',
        );
      } else if (discriminator === EXTEND) {
        requirePolicy(
          buy &&
            ix.programId.equals(AMM) &&
            key(ix, 0)?.equals(key(buy, 0)!) &&
            key(ix, 1)?.equals(owner),
          'Only the purchased pool can be extended.',
        );
      } else throw new Error('Unsupported Pump operation.');
      continue;
    }
    if (ix.programId.equals(SystemProgram.programId)) {
      requirePolicy(
        SystemInstruction.decodeInstructionType(ix) === 'Transfer',
        'Only SOL transfers are permitted.',
      );
      const t = SystemInstruction.decodeTransfer(ix);
      requirePolicy(
        t.fromPubkey.equals(owner),
        'Transfer must use the managed wallet.',
      );
      transfers++;
      if (pump.length)
        requirePolicy(
          buy &&
            amm &&
            t.toPubkey.equals(wsol) &&
            t.lamports === buy.data.readBigUInt64LE(16),
          'Pump transfers may only wrap the quoted SOL amount.',
        );
      else
        requirePolicy(
          destinations.includes(t.toPubkey.toBase58()) &&
            t.lamports <=
              BigInt(process.env.LOOP_MAX_TRANSFER_LAMPORTS || '100000000000'),
          'Transfer destination or amount is not authorized.',
        );
      continue;
    }
    if (ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      requirePolicy(
        pump.length &&
          key(ix, 0)?.equals(owner) &&
          (ix.data.length === 0 || (ix.data.length === 1 && ix.data[0] === 1)),
        'Only associated token account creation is permitted.',
      );
      const ownBase =
        !!ata &&
        key(ix, 1)?.equals(ata) &&
        key(ix, 2)?.equals(owner) &&
        key(ix, 3)?.equals(mint!) &&
        key(ix, 5)?.equals(tokenProgram!);
      const ownSol =
        key(ix, 1)?.equals(wsol) &&
        key(ix, 2)?.equals(owner) &&
        key(ix, 3)?.equals(NATIVE_MINT) &&
        key(ix, 5)?.equals(TOKEN_PROGRAM_ID);
      const claimVault =
        !buy &&
        key(ix, 1)?.equals(vaultAta) &&
        key(ix, 2)?.equals(vaultAuthority) &&
        key(ix, 3)?.equals(NATIVE_MINT) &&
        key(ix, 5)?.equals(TOKEN_PROGRAM_ID);
      requirePolicy(
        ownBase || ownSol || claimVault,
        'Unexpected associated token account.',
      );
      continue;
    }
    if (
      ix.programId.equals(TOKEN_PROGRAM_ID) ||
      ix.programId.equals(TOKEN_2022_PROGRAM_ID)
    ) {
      if (ix.data[0] === 15) {
        requirePolicy(
          buy &&
            ix.data.length === 10 &&
            ix.data.readBigUInt64LE(1) === buy.data.readBigUInt64LE(8) &&
            key(ix, 0)?.equals(ata!) &&
            key(ix, 1)?.equals(mint!) &&
            key(ix, 2)?.equals(owner) &&
            ix.programId.equals(tokenProgram!) &&
            tx.instructions.indexOf(ix) > tx.instructions.indexOf(buy),
          'Burn must match the purchased amount and token.',
        );
        burns++;
      } else if (ix.data[0] === 17)
        requirePolicy(
          buy &&
            amm &&
            ix.programId.equals(TOKEN_PROGRAM_ID) &&
            ix.data.length === 1 &&
            key(ix, 0)?.equals(wsol),
          'Only the managed WSOL account may be synchronized.',
        );
      else if (ix.data[0] === 9)
        requirePolicy(
          pump.length &&
            ix.programId.equals(TOKEN_PROGRAM_ID) &&
            ix.data.length === 1 &&
            key(ix, 0)?.equals(wsol) &&
            key(ix, 1)?.equals(owner) &&
            key(ix, 2)?.equals(owner),
          'Only WSOL may be closed back to its owner.',
        );
      else throw new Error('Token transfers and approvals are not permitted.');
      continue;
    }
    throw new Error('Transaction contains an unsupported program.');
  }
  requirePolicy(
    buy ? burns === 1 : burns === 0,
    'A buy requires exactly one matching burn.',
  );
  requirePolicy(transfers <= 1, 'Only one SOL transfer is permitted.');
  requirePolicy(
    pump.length || transfers === 1,
    'A payout must contain a transfer.',
  );
  return {
    message: tx.serializeMessage(),
    attach(signature: Uint8Array) {
      tx.addSignature(owner, Buffer.from(signature));
      requirePolicy(
        tx.verifySignatures(),
        'KMS returned an invalid signature.',
      );
      return tx.serialize().toString('base64');
    },
  };
}
