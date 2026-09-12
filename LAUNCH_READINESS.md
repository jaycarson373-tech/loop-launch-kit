# Loop launch readiness — September 12, 2026

**Decision: not ready for real funds or a public token launch.** The private website and execution implementation are available, but production services and complete network acceptance are outstanding. Do not treat CI, simulation or the readiness panel as proof of live trading.

## Production findings

- Sites has no runtime environment entries configured. No treasury, RPC, signer or keeper is active.
- The site is owner-private. A continuously running keeper needs an approved route through that audience gate; its application bearer token alone is insufficient.
- No Google Cloud project, managed treasury key, KMS workload or scheduler was provisioned. The owner's network, public treasury identity and hosting project are still needed.
- No token was launched and no real-funds transaction was signed or broadcast during this audit.

## Corrections made

- Persist signed bytes, signature and buyback engine checkpoint in one atomic D1 batch before broadcasting. Verify revision and lease, and prevent replay from replacing engine state.
- Cap each purchase at 1 SOL and split payouts at 100 SOL to fit signer policy; retain the minimum lot, cost reservations and pacing rules.
- Use finalized transaction receipts for financial settlement. Release keeper leases with updated timestamps so unresolved launches rotate fairly.
- Require valid HTTPS endpoints, public addresses and separate secret tokens. Execution defaults to paused even when credentials are present.
- Add authenticated readiness checks for database, artwork storage, correct RPC network and Pump programs, KMS treasury identity and recent keeper contact. Preparing a launch requires these checks to pass.
- Reject non-object JSON payloads and resolve legacy SDK browser exports explicitly so clean local startup works with the Worker environment.

## Application verification

- 39 unit tests passed, including SQLite transaction rollback and replay cases.
- TypeScript checks and the production Worker/client build passed.
- Local authenticated HTTP checks passed for readiness, invalid JSON, access/origin guards, D1 persistence, R2 upload/retrieval and disabled execution.
- Strict lint remains failing with 83 reported findings. Browser interaction and real wallet signing were not exercised.

## Protocol simulation evidence

A local Surfpool 1.5.0 fork of Solana devnet simulated the official SDK instructions. Signature verification was disabled and simulated account states were applied only with local cheatcodes. These are instruction-level checks, not wallet, KMS, D1 or network finalization acceptance.

| Flow                                          | Result      | Serialized bytes |
| --------------------------------------------- | ----------- | ---------------- |
| Pump `create_v2` and 0.01 SOL creator funding | Passed      | 908              |
| Curve buy, job memo and matching atomic burn  | Passed      | 904              |
| Creator-fee collection from both programs     | Passed      | 620              |
| Creator SOL payout                            | Passed      | 255              |
| Complete curve for migration fixture          | Passed      | 806              |
| Migrate completed curve to canonical pool     | Failed      | 1044             |
| PumpSwap buy and atomic burn                  | Not reached | —                |

Migration returned `ProgramFailedToComplete` with `Access violation in stack frame 5 at address 0x200005ff8 of size 8`. The source of that failure has not been established; it must be reproduced and resolved or isolated before claiming the post-graduation path works. The application detects migration rather than submitting migration transactions itself, but its buybacks still depend on a working canonical pool.

Reproduce using a separate local Surfpool instance on ports 8988/8989:

```sh
surfpool start --network devnet --host 127.0.0.1 --port 8988 --ws-port 8989 --no-deploy --ci --skip-signature-verification --skip-blockhash-check
node scripts/audit/protocol.cjs
```

The script intentionally fails at the first protocol error. It is not part of the deterministic CI suite and makes no mainnet writes.

## Required acceptance before activation

1. Configure the selected network RPC, managed treasury, authenticated signer and persistent keeper; keep `LOOP_EXECUTION_ENABLED=false` during service setup.
2. Verify private connectivity, all readiness checks, KMS signing permission, service restart behavior and operator access to logs.
3. On the agreed test environment, use a real compatible wallet to sign a launch; verify metadata, funding and the finalized mint. Confirm exact debits and transaction identity.
4. Generate creator fees, claim them, verify 70/10/20 accounting, creator payout and net platform transfer. Configure the main mint and verify its 80/0/20 allocation and separate treasury stream.
5. Exercise curve and canonical-pool buybacks with atomic burns, packet limits, slippage, expiry, RPC loss and process interruption. Prove that retry/restart does not double spend or double book income.
6. Complete browser/wallet interaction validation and resolve outstanding dependency/security review findings. The repository's strict lint command is not currently a passing gate.
7. Review the final execution limits and only then enable execution. A public launch also needs an explicit audience change from the current private site.

Pausing does not revoke previously signed bytes or undo a broadcast. Reservations for unresolved transactions must remain held until network evidence establishes their outcome.
