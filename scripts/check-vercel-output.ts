import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Check the traced serverless bundle, not just the full node_modules checkout.
const tracePath = resolve(
  '.next/server/app/api/loop/[...path]/route.js.nft.json',
);
const trace = JSON.parse(await readFile(tracePath, 'utf8')) as {
  files: string[];
};
assert.ok(Array.isArray(trace.files) && trace.files.length > 0);
let bytes = 0;
for (const file of new Set(trace.files))
  bytes += (await stat(resolve(dirname(tracePath), file))).size;
assert.ok(
  trace.files.some((file) => file.includes('vendor/bigint-buffer/index.cjs')),
  'The Vercel function must include the local integer compatibility workspace.',
);
assert.ok(
  bytes < 240_000_000,
  `Function trace is too large for Vercel: ${bytes} bytes.`,
);
console.log(
  `Vercel API trace verified: ${trace.files.length} files, ${(bytes / 1_000_000).toFixed(1)} MB, including the workspace dependency.`,
);
