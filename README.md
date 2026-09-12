# Loop Finance

Independent Solana launchpad preview inspired by Revolve's publicly described product. This repository contains a working website and deterministic buyback policy/accounting engine. It is **not a deployed token or an operational trading service**.

## Run

Requires Node 24 (or a Node release supporting native TypeScript stripping) and npm.

```sh
npm install
npm run dev
npm test
npx tsc --noEmit
npm run build
npm run simulate -- 10 55
npm run simulate -- 10 55 --main
```

The website supports token-plan creation, image preview, validated project links and payout addresses, browser-local draft storage, plan export, an interactive buyback simulator, a treasury allocation calculator, and policy documentation. Nothing requests a wallet signature, private key, or payment. Drafts remain on the device and can be exported. An image stored as a data URL must be uploaded to a durable public metadata host before a real launch.

## Buyback implementation

`lib/buybacks.ts` implements exact lamport accounting, 70/10/20 creator-fee allocations (80/0/20 for LOOP), idempotent receipt crediting, a 50% drop trigger against the rolling 20-minute high, re-arming above 80% of that high, 2.5% cycle lots, a 0.05 SOL minimum, four-lot batches with two-second scheduled spacing, fee-inclusive reservations, settlement by observed debit, fail-closed receipt mismatches, uncertain-transaction holds, and venue migration pauses. The treasury stream uses 50% of independently verified net platform revenue and one eligible lot per minute. Price freshness is required. Proposed live slippage is capped at 1%.

The simulator and the tested engine share implementation. Simulator costs are examples; they are not RPC quotes. `creditCreatorFees` and `creditNetPlatformRevenue` expect already verified receipts; they do not verify chain evidence themselves. The snapshot is an audit export, not a complete restart checkpoint. The engine is synchronous, mutable, and in memory. A live operator must serialize state changes durably and isolate the state of every coin.

## Production work remaining

The reference site's private backend is not public source and has not been copied. Live behavior needs its own implementation:

1. Obtain the owner's public treasury and payout addresses, choose the network, and finalize the fee policy.
2. Implement Wallet Standard signing, current Pump create/buy instructions and creator-fee collection using the official SDK/IDL; validate owner, mint, creator, vaults, venue and token program.
3. Host token artwork and metadata durably; quote current launch costs and simulate the full transaction before presenting it for user signature.
4. Build and test atomic swap-and-burn transactions for the bonding curve and canonical PumpSwap pool. Reject unsupported Token-2022 extensions. Verify delivered amounts and account balance changes.
5. Add a durable, transactional ledger and outbox, trusted RPC price ingestion, per-coin locking, receipt reconciliation, monitoring and a running keeper. Persist the signed transaction's identity before broadcast; ambiguous submission must never cause a duplicate spend.
6. Add a reviewed signing/custody architecture and authorization. No secrets belong in the browser, repo, exported plans, or chat. Fee/payout accounting needs confirmed network evidence and actual costs.
7. Test with forked/local state and adversarial receipts, then review deployment and funding before enabling mainnet.

Token creation, claims, payouts, custody, swaps, burns, automatic background execution, and inactivity retirement/sweeping are **not implemented as live integrations**. The UI states this explicitly. There is no contract address, fake transaction history, funded treasury, guaranteed return, or setup charge.

## Reference findings

Observed September 12, 2026:

- The supplied `https://t.co/wRaPUGJCKw` redirects to `https://revolvepad.com/`.
- Revolve's public interface labels its launch infrastructure as pump.fun. Its `/api/public-links` returns the main-token URL `https://pump.fun/coin/J8X5ygWHY5uHFch7m3MisSC7eDAWpAkgi1pyqfT5pump`.
- This identifies the advertised launch platform and token link; it is not an independent transaction-history audit or evidence of a Pump Fund investment.
- Revolve describes standard 70/10/20 fee allocations and a separate 80/20 main-token policy. Loop's implementation was written independently from public behavior descriptions; it does not reuse source code, assets, wallets, or branding from Revolve.
- Current official integration references: https://github.com/pump-fun/pump-public-docs and its coin creation, buy, creator-fee and PumpSwap documents.

## Verification notes

Tests cover accounting conservation, input validation, idempotent claims and settlement, fresh price requirements, rolling-window expiry, threshold boundaries, batching, uncertain receipts, cost settlement, halted mismatches, migration, treasury cadence and simulator behavior. No chain transaction is broadcast by tests.

The site registers a feature-detected WebMCP `simulate_loop_buybacks` tool while the simulator is mounted. A supported WebMCP validation context was unavailable; the registration/interaction contract has not been browser-verified. Browser UI testing was not requested. Production build and TypeScript checks are used for compilation validation.
