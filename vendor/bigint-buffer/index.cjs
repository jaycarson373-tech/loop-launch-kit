// Native-free implementation of the four bigint-buffer APIs used by SPL layouts.
'use strict';
const { Buffer } = require('node:buffer');
function toBigIntBE(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected bytes');
  const hex = Buffer.from(bytes).toString('hex');
  return hex ? BigInt('0x' + hex) : 0n;
}
function toBigIntLE(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected bytes');
  return toBigIntBE(Buffer.from(bytes).reverse());
}
function toBufferBE(value, width) {
  if (typeof value !== 'bigint' || value < 0n)
    throw new RangeError('Unsigned bigint required');
  if (!Number.isSafeInteger(width) || width < 0 || width > 1024)
    throw new RangeError('Invalid width');
  if (value >= 1n << BigInt(width * 8))
    throw new RangeError('Value exceeds buffer width');
  if (width === 0) return Buffer.alloc(0);
  return Buffer.from(value.toString(16).padStart(width * 2, '0'), 'hex');
}
function toBufferLE(value, width) {
  return toBufferBE(value, width).reverse();
}
module.exports = { toBigIntBE, toBigIntLE, toBufferBE, toBufferLE };
