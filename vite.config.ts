import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import hostingConfig from './.openai/hosting.json' with { type: 'json' };

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'loop-assets',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    resolve: {
      alias: [
        {
          find: /^(rpc-websockets|@solana\/(?:codecs(?:-[a-z-]+)?|options|errors))$/,
          replacement: '$1',
          customResolver(source: string, importer?: string) {
            // Vinext removes the browser condition from RSC. Legacy packages
            // expose browser/node only; preserve the importer's codec version.
            const entry = createRequire(
              importer?.split('?')[0] || import.meta.url,
            ).resolve(source);
            return join(dirname(entry), 'index.browser.mjs');
          },
        },
        {
          find: /^@solana\/kit-plugin-wallet$/,
          replacement: fileURLToPath(
            new URL(
              './node_modules/@solana/kit-plugin-wallet/dist/index.browser.mjs',
              import.meta.url,
            ),
          ),
        },
        {
          find: /^@solana\/kit-plugin-wallet\/react$/,
          replacement: fileURLToPath(
            new URL(
              './node_modules/@solana/kit-plugin-wallet/dist/react/index.browser.mjs',
              import.meta.url,
            ),
          ),
        },
      ],
    },
    define: { 'process.env.ANCHOR_BROWSER': JSON.stringify('true') },
    environments: {
      rsc: {
        optimizeDeps: {
          include: [
            '@pump-fun/pump-sdk',
            '@pump-fun/pump-swap-sdk',
            '@solana/web3.js',
            '@solana/spl-token',
            '@coral-xyz/anchor',
            'bn.js',
          ],
        },
      },
    },
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
