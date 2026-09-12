import { test } from 'node:test';
import assert from 'node:assert/strict';
import codec from 'bigint-buffer';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const resolve = createRequire(import.meta.url).resolve;
void test('SPL layouts resolve the audited workspace integer implementation', () => {
  const dependency = resolve('bigint-buffer', {
    paths: [dirname(resolve('@solana/buffer-layout-utils'))],
  });
  assert.equal(
    realpathSync(dependency),
    realpathSync(
      fileURLToPath(
        new URL('../vendor/bigint-buffer/index.cjs', import.meta.url),
      ),
    ),
  );
});
void test('native-free integer codecs round trip unsigned 64/128/256-bit values', () => {
  for (const width of [8, 16, 32]) {
    for (const value of [0n, 1n, 123456789n, (1n << BigInt(width * 8)) - 1n]) {
      assert.equal(codec.toBigIntBE(codec.toBufferBE(value, width)), value);
      assert.equal(codec.toBigIntLE(codec.toBufferLE(value, width)), value);
      assert.equal(codec.toBufferBE(value, width).length, width);
    }
  }
  assert.equal(codec.toBigIntLE(Buffer.alloc(1024, 255)), (1n << 8192n) - 1n);
  assert.equal(codec.toBigIntBE(Buffer.alloc(0)), 0n);
});
void test('integer codecs reject overflow, negative values and invalid widths', () => {
  for (const width of [-1, 1.5, Infinity, 1025])
    assert.throws(() => codec.toBufferLE(0n, width));
  assert.throws(() => codec.toBufferBE(-1n, 8));
  assert.throws(() => codec.toBufferBE(256n, 1));
  assert.throws(() => codec.toBufferBE(1n, 0));
});
