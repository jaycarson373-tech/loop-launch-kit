import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: [
    '@libsql/client',
    '@pump-fun/pump-sdk',
    '@pump-fun/pump-swap-sdk',
    '@solana/web3.js',
    '@solana/spl-token',
    '@coral-xyz/anchor',
    'bn.js',
  ],
};

export default nextConfig;
