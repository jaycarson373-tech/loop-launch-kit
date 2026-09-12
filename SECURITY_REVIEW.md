# Dependency and execution review

September 12, 2026. This is a repository review and test record, not an independent custody or smart-contract audit.

## Dependency findings

The post-update npm audit reports **zero critical, zero high and two moderate findings**. Cloudflare tooling, WebSocket handling, UUID, TOML and the development bundler were updated. Unused starter components and their dependencies were removed.

The unpatched native `bigint-buffer` package was replaced throughout the dependency graph by `vendor/bigint-buffer`, a bounds-checked JavaScript implementation with no native addon. Tests cover unsigned integer boundary values, overflow and oversized buffers. The official Pump SDK protocol and signing-policy simulations pass with this replacement.

The remaining `jayson` and `stream-json` findings both trace to [GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x). The issue concerns streaming pick/ignore/filter/replace operations on nested input. Loop imports the Jayson browser HTTP client through the Solana SDK; it does not start Jayson TCP servers or use stream-json filters. Loading the Pump SDK in Node does not load stream-json or Jayson's server utilities. No forced incompatible ESM upgrade was applied to this dormant CommonJS server dependency. Reassess if those server APIs are introduced or the SDK changes.

## Execution controls verified

- Exact transaction message/signature checks and destination constraints.
- Buy-and-burn atomicity, compute/spend ceilings and rejected approvals/unrelated transfers.
- Atomic signed-ledger/checkpoint persistence, crash rollback and replay prevention.
- Separate bounded signer/keeper authentication and malformed HTTP body rejection.
- Readiness checks plus an explicit disabled-by-default execution switch.
- Finalized receipts and reservations retained for uncertain outcomes.

A local mainnet fork passed creation, curve buy/burn, fee claim, payout, curve completion, migration and PumpSwap buy/burn. This does not validate the cloud workload's KMS permissions, a real wallet extension, funded network finalization, service connectivity or operational monitoring. Those require the selected live infrastructure and acceptance run.
