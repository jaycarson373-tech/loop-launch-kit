import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Keypair,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  PublicKey,
} from '@solana/web3.js';
import { reviewSigningPayload } from '../keeper/solana-boundary.ts';
const owner = Keypair.generate(),
  recipient = Keypair.generate(),
  other = Keypair.generate();
function payload(to = recipient.publicKey) {
  const tx = new Transaction({
    feePayer: owner.publicKey,
    blockhash: Keypair.generate().publicKey.toBase58(),
    lastValidBlockHeight: 100,
  }).add(
    SystemProgram.transfer({
      fromPubkey: owner.publicKey,
      toPubkey: to,
      lamports: 1000,
    }),
  );
  return tx;
}
void test('signer policy rejects unknown payout destinations', () => {
  const tx = payload(other.publicKey);
  assert.throws(() =>
    reviewSigningPayload(
      Buffer.from(tx.serialize({ requireAllSignatures: false })).toString(
        'base64',
      ),
      owner.publicKey.toBase58(),
      [recipient.publicKey.toBase58()],
    ),
  );
});
void test('signer attaches and verifies signatures without changing the reviewed message', () => {
  const tx = payload(),
    unsigned = Buffer.from(
      tx.serialize({ requireAllSignatures: false }),
    ).toString('base64');
  const request = reviewSigningPayload(unsigned, owner.publicKey.toBase58(), [
    recipient.publicKey.toBase58(),
  ]);
  tx.sign(owner);
  const result = Transaction.from(
    Buffer.from(request.attach(tx.signature!), 'base64'),
  );
  assert.ok(result.verifySignatures());
  assert.deepEqual(result.serializeMessage(), request.message);
});
void test('signer rejects an unsupported program and wrong fee payer', () => {
  const tx = payload();
  tx.add(
    new TransactionInstruction({
      programId: other.publicKey,
      keys: [],
      data: Buffer.alloc(0),
    }),
  );
  assert.throws(() =>
    reviewSigningPayload(
      Buffer.from(tx.serialize({ requireAllSignatures: false })).toString(
        'base64',
      ),
      owner.publicKey.toBase58(),
      [recipient.publicKey.toBase58()],
    ),
  );
  const valid = payload();
  assert.throws(() =>
    reviewSigningPayload(
      Buffer.from(valid.serialize({ requireAllSignatures: false })).toString(
        'base64',
      ),
      other.publicKey.toBase58(),
      [recipient.publicKey.toBase58()],
    ),
  );
});

void test('signer rejects token approval appended to an otherwise allowed transfer', async () => {
  const {
    createApproveInstruction,
    getAssociatedTokenAddressSync,
    NATIVE_MINT,
  } = await import('@solana/spl-token');
  const tx = payload();
  tx.add(
    createApproveInstruction(
      getAssociatedTokenAddressSync(NATIVE_MINT, owner.publicKey),
      other.publicKey,
      owner.publicKey,
      100,
    ),
  );
  assert.throws(() =>
    reviewSigningPayload(
      Buffer.from(tx.serialize({ requireAllSignatures: false })).toString(
        'base64',
      ),
      owner.publicKey.toBase58(),
      [recipient.publicKey.toBase58()],
    ),
  );
});
void test('signer rejects unsupported Pump instructions instead of trusting any Pump call', () => {
  const tx = payload();
  tx.add(
    new TransactionInstruction({
      programId: new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
      keys: [],
      data: Buffer.alloc(8),
    }),
  );
  assert.throws(() =>
    reviewSigningPayload(
      Buffer.from(tx.serialize({ requireAllSignatures: false })).toString(
        'base64',
      ),
      owner.publicKey.toBase58(),
      [recipient.publicKey.toBase58()],
    ),
  );
});
void test('signer rejects excessive priority fees', async () => {
  const { ComputeBudgetProgram } = await import('@solana/web3.js');
  const tx = payload().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 }),
  );
  assert.throws(() =>
    reviewSigningPayload(
      Buffer.from(tx.serialize({ requireAllSignatures: false })).toString(
        'base64',
      ),
      owner.publicKey.toBase58(),
      [recipient.publicKey.toBase58()],
    ),
  );
});
void test('signer requires a matching atomic burn and disallows an appended payout on a buy', async () => {
  const {
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID,
    createBurnCheckedInstruction,
  } = await import('@solana/spl-token');
  const mint = Keypair.generate().publicKey,
    ata = getAssociatedTokenAddressSync(mint, owner.publicKey);
  const keys = Array.from({ length: 16 }, () => ({
    pubkey: recipient.publicKey,
    isSigner: false,
    isWritable: false,
  }));
  keys[2] = { pubkey: mint, isSigner: false, isWritable: true };
  keys[5] = { pubkey: ata, isSigner: false, isWritable: true };
  keys[6] = { pubkey: owner.publicKey, isSigner: true, isWritable: true };
  keys[8] = { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false };
  const data = Buffer.alloc(25);
  Buffer.from('66063d1201daebea', 'hex').copy(data);
  data.writeBigUInt64LE(100n, 8);
  data.writeBigUInt64LE(50_000_000n, 16);
  const buy = new TransactionInstruction({
    programId: new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
    keys,
    data,
  });
  const tx = new Transaction({
    feePayer: owner.publicKey,
    blockhash: Keypair.generate().publicKey.toBase58(),
    lastValidBlockHeight: 100,
  }).add(buy);
  const review = () =>
    reviewSigningPayload(
      Buffer.from(tx.serialize({ requireAllSignatures: false })).toString(
        'base64',
      ),
      owner.publicKey.toBase58(),
      [recipient.publicKey.toBase58()],
    );
  assert.throws(review);
  tx.add(createBurnCheckedInstruction(ata, mint, owner.publicKey, 100n, 6));
  assert.doesNotThrow(review);
  tx.add(
    SystemProgram.transfer({
      fromPubkey: owner.publicKey,
      toPubkey: recipient.publicKey,
      lamports: 1000,
    }),
  );
  assert.throws(review);
});
