# Loop deployment kit

`bash infra/deploy-signer.sh PROJECT_ID REGION` provisions a Google Cloud signing service from the committed source. The project must already exist with billing enabled and the deploying operator signed in. Run `npm ci` first. This script creates billable resources; it has not been run against a live cloud account in this checkout.

The script enables required APIs, creates a dedicated key ring and pure Ed25519 treasury, grants a workload service account narrowly scoped KMS permissions, generates separate random signer/keeper secrets directly into Secret Manager, builds the pinned container and deploys Cloud Run. Cloud Run accepts HTTPS requests at the transport layer; every application route requires the signer bearer token. No private key is exported and no transaction is signed by provisioning.

Only public treasury details are printed. Configure the Site's RPC, cluster, signer URL and treasury, and transfer secret values from Secret Manager to the Site's secret settings through the deployment operator's secure tooling. Leave `LOOP_EXECUTION_ENABLED=false`. Do not paste tokens in chat or commit them. The script uses managed treasury key version 1; treasury rotation requires an explicit migration and funding plan.

## Keeper connectivity

For Vercel, run `bash infra/deploy-keeper.sh PROJECT_ID REGION HTTPS_SITE_ORIGIN` after the signer script and application configuration. The worker uses a separate service account with access only to its keeper token, not the signing keys. It serves `GET /health`, reports stale contact after 90 seconds, handles shutdown, runs with one minimum instance and CPU allocation between requests, and keeps deployment protection enabled. Cloud provisioning is still unverified against a real account in this checkout.

If Vercel Deployment Protection is enabled, create an automation bypass in Vercel and store it in Google Secret Manager. Set `LOOP_VERCEL_BYPASS_SECRET` to that **secret's name** before running the script. The secret value is injected as `LOOP_VERCEL_BYPASS` and sent only in the `x-vercel-protection-bypass` header, never in a URL. Without an approved bypass, the worker correctly reports failures instead of treating an authentication page as a successful poll. See [Vercel automation access](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation) and [Cloud Run background CPU](https://cloud.google.com/blog/topics/developers-practitioners/use-cloud-run-always-cpu-allocation-background-work).

The Sites website remains owner-private. `keeper/runner.ts` requires an approved service access path through the Sites audience gate. The app bearer token cannot authenticate that outer gate. No bypass token, browser cookie or short-lived development credential is built into the kit. Until that path is configured, the readiness panel reports a stale/missing keeper and launch preparation stays disabled.

Deploy the runner as a supervised process only after that connectivity exists, using `LOOP_SITE_ORIGIN` and the separate `LOOP_KEEPER_TOKEN`. Use the same container with its command changed to `node --experimental-strip-types keeper/runner.ts`. Alert on failed requests and a heartbeat older than 90 seconds. Reconcile pending transactions on recovery before enabling new activity.

## Release workflow

1. Clean install, lint, unit tests, type check, production build and local D1/R2 HTTP checks run in GitHub Actions.
2. `scripts/audit/protocol.cjs` separately exercises real Pump instructions against a local Surfpool fork, including the signing policy. It never broadcasts. Use the mainnet fork for current production-program parity; the devnet fork's migration still needs upstream investigation.
3. Configure live services, confirm readiness, and complete wallet/KMS/network acceptance as described in `LAUNCH_READINESS.md`.
4. Enable execution only for the selected and tested cluster. Changing the site's private audience is a separate explicit release decision.

## Backups and recovery

On Vercel, preserve the Turso database and KMS keys together. Back up before schema changes. The application applies checked-in migrations on first database access using the migration ledger and write transactions; builds never access the database. Run `node --experimental-strip-types scripts/sync-migrations.ts` after generating migrations. CI verifies the runtime migration bundle exactly matches the source SQL. Wallet sessions are revocable database records; rotating `LOOP_SESSION_SECRET` forces everyone to sign in again. Existing operator records remain in the operator workspace and are not assigned to arbitrary wallet accounts.

The D1 ledger and the KMS keys form one custody system. Preserve both. Export D1 before schema changes and enable cloud audit logging for key operations. Never destroy creator or treasury keys with unsettled balances. A failed/uncertain transaction must retain its reservation until finalized network evidence establishes the outcome. Pausing execution does not invalidate signed transactions.
