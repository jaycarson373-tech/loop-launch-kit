# Loop launch readiness — September 12, 2026

**The release candidate is verified locally; live activation is still blocked.** The fresh private repository is [loop-launch-kit](https://github.com/jaycarson373-tech/loop-launch-kit). The website remains private with financial execution paused.

## Verified in this release

- 44 passing tests: buyback accounting, transaction recovery and replay protection, malformed checkpoints, signer restrictions, signer HTTP authentication/body limits, native-free integer codecs and readiness gates.
- Lint, type checking and production build pass. GitHub Actions now also exercises local authenticated HTTP flows against D1 and R2.
- Dependency audit: zero critical, zero high, two moderate findings confined to an unused legacy server dependency. See `SECURITY_REVIEW.md` for scope and evidence.
- A local fork of current mainnet programs passes every protocol stage below. Actual buy, fee-claim and payout instructions also pass the managed signer's transaction policy.
- Cloud KMS/Cloud Run provisioning, container configuration, secret exclusions and repeatable verification scripts are included in `infra/`. Cloud provisioning has not been run without an owner-selected project.

## Protocol evidence

See `reports/protocol-mainnet-fork.json`. Surfpool 1.5.0 ran locally with signature verification disabled. Account changes used only local cheatcodes; nothing was signed or broadcast to mainnet or devnet.

| Flow                                         | Result | Serialized bytes |
| -------------------------------------------- | ------ | ---------------- |
| Pump creation and creator funding            | Passed | 908              |
| Curve buy with memo and exact atomic burn    | Passed | 904              |
| Creator-fee collection                       | Passed | 620              |
| Creator payout                               | Passed | 255              |
| Complete curve                               | Passed | 806              |
| Migrate to canonical PumpSwap pool           | Passed | 1044             |
| PumpSwap buy with memo and exact atomic burn | Passed | 1181             |

The earlier devnet-fork migration failed with a program stack access violation. The same flow succeeds with the mainnet program set. That comparison isolates the failure to the tested devnet/program-runtime combination; it does not establish its upstream cause. Do not claim the complete devnet flow works. The repeatable `Verify Pump protocol` workflow uses a local mainnet fork and a checksum-verified Surfpool release.

## Required before live activation

1. **Owner configuration:** choose the Solana network and a billing-enabled Google Cloud project/region. Use the managed treasury created by the deployment script, or identify an existing compatible KMS treasury. No private key or seed phrase is needed in chat.
2. **Live services:** deploy the signer, configure RPC and runtime secrets, establish an approved keeper access path through the private Sites audience gate, and start the supervised runner. A keeper app token alone cannot bypass the outer audience gate. The guide's readiness panel must pass.
3. **Funded acceptance:** use an actual compatible wallet and the deployed KMS workload to launch, claim fees, pay creators, transfer net platform receipts and execute both curve and pool buy/burn paths. Verify finalized receipts, exact allocations, interrupted submission/restart recovery and operator monitoring. Browser/wallet interaction and cloud KMS signing have not been exercised by the local tests.
4. **Release decision:** approve the selected network's final limits and enable `LOOP_EXECUTION_ENABLED`. Mainnet additionally needs `LOOP_ALLOW_MAINNET=true`. Change the private site audience explicitly when ready for a public launch.

No live treasury, RPC, signer or keeper settings were supplied or configured. No token has been launched. An independent custody/trading review remains advisable before accepting other people's funds.

Pausing does not revoke previously signed transactions. Reservations for uncertain outcomes remain held until finalized network evidence resolves them. Preserve the D1 ledger and its corresponding KMS keys together during recovery.
