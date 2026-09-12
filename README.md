# Loop Finance

Independent Solana launchpad inspired by Revolve's public product. The app includes server-persisted launch plans, artwork storage, Wallet Standard connection, Pump launch preparation and signing, a durable buyback ledger, transaction reconciliation, and managed-signer/keeper services.

**Real-funds launch status: NOT READY.** See [the dated readiness report](LAUNCH_READINESS.md).

**Deployment status:** the private website works. Financial execution is configuration-gated. A funded token launch, managed KMS signer, continuously running keeper, and live buyback acceptance run have not been deployed or performed. Do not equate passing local tests with live trading readiness.

## Development

Requires Node 24 and npm.

```sh
npm ci
npx wrangler d1 migrations apply DB --local --config wrangler.local.json
npm run dev -- --port 3001
```

Open `/signin-with-chatgpt?return_to=/` once for the local Sites test identity. Production uses the Sites dispatcher identity and its private access policy. Production routes must never be exposed directly on a server that trusts client-supplied identity headers.

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
# With the dev server running and live credentials absent:
npm run test:api
npm run simulate -- 10 55
```

`test:api` creates local test drafts and artwork; it never calls a signer or submits a transaction. D1 migrations under `drizzle/` are packaged and applied by Sites on deployment. R2 stores original artwork. The website remains private unless its owner changes access.

## What is implemented

- Connect compatible Solana wallets through Kit's Wallet Standard plugin. The browser holds the ephemeral new-mint signer only in memory. Wallets must support signing without automatic broadcast.
- Create and edit authenticated launch drafts in D1; upload PNG/JPEG/WebP artwork to R2; export plans. Old browser drafts remain available for recovery.
- Provision a dedicated managed creator wallet, upload public Pump metadata, build and simulate `create_v2`, review costs, and submit a wallet-signed transaction. The 0.01 SOL creator-vault funding is disclosed in the review. Wallet debit also includes network fees and account rent.
- Use official Pump and PumpSwap SDKs behind an isolated legacy `web3.js` compatibility adapter. The frontend uses Solana Kit. The Worker build disables Anchor's Node-only workspace loader with `ANCHOR_BROWSER`.
- Fetch verified bonding-curve/canonical-pool state, enforce SOL pairs and supported token extensions, collect creator fees, parse finalized fee events, pay creators, transfer net platform receipts, and buy an exact amount with an atomic matching burn. Every RPC transaction path verifies the selected cluster's genesis hash.
- Store signed bytes, transaction identity and engine checkpoint atomically in a D1 batch before broadcast. D1 leases and revision checks serialize each launch. Ambiguous submissions retain their reservation and block further spending. Finalized compiled messages must match stored messages exactly. Known receipts are applied once, including after restart.
- Display persisted launches, pending/confirmed buyback activity, explorer receipts and treasury accounting. Empty activity stays empty; charts marked as simulations are hypothetical.

## Fee and buyback policy

The engine uses integer lamports. Standard creator-fee income is split 70% buyback, 10% creator and 20% platform. The configured main mint uses 80/0/20. Claim costs and an initial operating subsidy are repaid before net platform distributions.

A drop of at least 50% from the rolling 20-minute observed high releases held buyback funds. Recovery above 80% re-arms the trigger. Each cycle uses 2.5% lots, a 0.05 SOL minimum, a 1 SOL maximum per lot, at most four lots per batch and two-second spacing. Purchase and cost ceilings are reserved together. Unspendable dust returns to held funds. New income stays held during an existing cycle.

Half of verified net platform transfers funds the main mint's separate treasury stream, targeting one eligible lot per minute. Platform receipts are retained even before the main mint is configured. Quote allowance is at most 1%; signer defaults additionally cap each buy at 1 SOL and each payout at 100 SOL. The engine also splits payouts at 100 SOL. Changing only signer limits does not change the engine caps. Simulation values do not constitute network quotes or investment projections.

## Runtime configuration and activation

The checked-in `config/site.env.example` and `config/signer.env.example` contain names and empty placeholders only. Configure runtime values through Sites and your signing-service secret manager; never commit wallet keys or tokens.

| Site setting                           | Purpose                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `LOOP_CLUSTER`                         | `devnet` by default; `mainnet-beta` requires explicit operator approval |
| `LOOP_RPC_URL`                         | Reliable HTTP RPC for exactly that network                              |
| `LOOP_TREASURY_ADDRESS`                | Public managed treasury address                                         |
| `LOOP_MAIN_MINT`                       | Confirmed Loop launch mint for the 80/20 and treasury policy            |
| `LOOP_SIGNER_URL`, `LOOP_SIGNER_TOKEN` | HTTPS managed signer and its secret bearer token                        |
| `LOOP_KEEPER_TOKEN`                    | Secret bearer token for the application's keeper route                  |
| `LOOP_EXECUTION_ENABLED`               | Defaults to false; explicit execution switch after acceptance           |
| `LOOP_ALLOW_MAINNET`                   | Must be `true` to permit configured mainnet execution                   |

Configuration is validated for HTTPS URLs, public addresses, independent secret tokens and the selected cluster. Credentials alone never enable execution: `LOOP_EXECUTION_ENABLED=true` is also required. The guide's readiness panel checks D1, R2, RPC genesis/programs, managed treasury key access and a keeper heartbeat within 90 seconds. Preparing a launch requires all these service checks to pass. Service checks do not certify a funded acceptance run.

Pump's devnet program supported creation, curve buy/burn and fee collection in our local Surfpool simulation. The same audit failed at curve migration with a program stack access violation; PumpSwap buy/burn acceptance remains incomplete. See the report and `scripts/audit/protocol.cjs` for reproducibility.

See `keeper/README.md` for Google Cloud KMS and runner deployment. The treasury must be controlled by the configured managed key for automated treasury buys. A personal wallet's public address alone cannot make that service sign. The runner must have an approved path through the private Sites audience gate; the application bearer token alone cannot bypass it. No cloud account or service has been provisioned by this repository.

Activation requires the owner's network and treasury choice, RPC/signing infrastructure, deployed scheduler, funded test acceptance, and review of the final execution policy. No seed phrase belongs in chat, source, environment variables, or the browser.

## Verification and remaining limits

Unit tests also cover signed-ledger crash rollback, stale leases, replay protection and readiness configuration. Other tests cover allocation conservation, idempotency, rolling prices, trigger boundaries, lot spacing, uncertain outcomes, failed fees, over-budget halts, migration, restart checkpoints, operating debt and signer restrictions. Local HTTP checks cover authentication, origins, invalid inputs, D1 edits, R2 uploads and execution gates. CI repeats tests, type checks and build.

A live wallet/network acceptance run and independent custody/trading audit remain outstanding. Transactions that are signed but cannot be proven confirmed or failed remain held indefinitely; do not manually release their funds without network evidence. The bounded legacy packet format rejects oversized transactions rather than silently splitting an atomic buy/burn. Background retirement/sweeping is not implemented. Trading frequency depends on the keeper's capacity and available RPC service; the current runner handles three launches per request.

Dependency scanning still needs review for legacy Pump SDK transitive packages; do not use `npm audit fix --force` to replace supported SDKs with obsolete major versions. The Worker excludes Anchor's filesystem workspace path. No claim of a clean independent security audit is made.

Browser UI testing was not requested. WebMCP `simulate_loop_buybacks` is feature-detected; a compatible browser validation context was unavailable. Compilation and HTTP checks do not replace that UI check. The starter’s strict lint command currently reports remaining type-style/accessibility findings in the app and bundled UI components; lint is not represented as a passing CI gate.

## Reference findings

Observed September 12, 2026: the supplied short link redirects to [Revolve](https://revolvepad.com/). Its site identifies pump.fun and its public-links API points to [this REVOLVE mint](https://pump.fun/coin/J8X5ygWHY5uHFch7m3MisSC7eDAWpAkgi1pyqfT5pump). This is the advertised launch platform, not independent evidence of a Pump Fund investment or an audited launch history. Loop uses its own branding and implementation.

Integration references: [Pump public documentation](https://github.com/pump-fun/pump-public-docs), [Solana genesis verification](https://solana.com/docs/rpc/http/getgenesishash), [KMS signing API and pure Ed25519](https://docs.cloud.google.com/kms/docs/reference/rpc/google.cloud.kms.v1).
