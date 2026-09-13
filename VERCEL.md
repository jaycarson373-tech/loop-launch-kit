# Import Loop into Vercel

Import **https://github.com/jaycarson373-tech/loop-launch-kit** and select branch `main`.

The repository is public. Import its URL directly into Vercel. If it is missing from your connected repository list, use **Adjust GitHub App Permissions** and grant Vercel access to `loop-launch-kit`.

Use these settings (also checked into `vercel.json`):

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Root directory | Repository root; leave blank |
| Node.js | 24.x |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `.next` |

Do not select `vendor/bigint-buffer` as the project root. It is a dependency workspace included in the repository. Clear any previous Vite/Cloudflare build and output overrides when reusing an existing Vercel project.

## Persistent workspace

The site builds and displays without secrets. Saving launch plans and artwork requires a database and wallet sign-in. Each wallet has its own private workspace. Missing settings produce a setup message rather than pretending data was saved.

1. Create a Turso libSQL database. Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to the Vercel project's environment variables. Do not use a `file:` URL on Vercel: its filesystem is temporary.
2. Generate `LOOP_SESSION_SECRET` with `openssl rand -hex 32`. Keep it in the Vercel environment settings and your password manager. Optionally set a **different** generated `LOOP_ADMIN_PASSWORD` to retain access to the original operator workspace; public users never need that password.
3. Redeploy in Vercel after setting the variables. The first database operation applies the checked-in schema migrations transactionally. No separate migration command is required. Existing records are preserved. An explicit `npm run db:migrate` remains available for controlled rollouts.
4. Open `/signin`, connect a compatible Solana wallet and approve the sign-in message. This signs a message only, with no network transaction or fee. Create a draft, upload artwork, save it, and reload to confirm persistence. A second wallet must have a separate workspace.

Use a separate database and credentials for Vercel Preview deployments. The build does not access production data; schema updates run on first database access in the deployed runtime. Back up the database before deploying schema changes. Existing Sites D1/R2 records remain on Sites and are not transferred automatically.

Database records and uploaded artwork are both stored in Turso. Transactions remain atomic through libSQL write batches. Wallet challenges expire after five minutes, bind the browser and origin, and can be used only once. Ed25519 verification proves ownership of the exact wallet address. Session cookies are signed, expire after eight hours, and are HttpOnly, SameSite=Strict and Secure on HTTPS. Sessions are recorded server-side and revoked on logout. Rotating the session secret invalidates all sessions. Vercel ignores all `oai-authenticated-user-id` headers from clients.

Explore, treasury, buyback history and artwork attached to active launches are public. Drafts, unpublished artwork, transaction actions and readiness checks require authentication. One wallet cannot read or modify another wallet's drafts or unpublished artwork. Keep Vercel Deployment Protection enabled if you want the entire website private. Repository visibility does not control website access.

## Financial execution

Importing and deploying does not activate token launches or spend funds. Keep `LOOP_EXECUTION_ENABLED=false` until the managed signer, RPC, treasury, keeper and funded acceptance are complete. See `config/site.env.example`, `infra/README.md`, and `LAUNCH_READINESS.md`.

Use `bash infra/deploy-keeper.sh PROJECT REGION HTTPS_ORIGIN` after deploying the signer and configuring the application keeper token. It deploys a continuous Cloud Run worker with a health endpoint and CPU allocation between requests. It has no KMS access. If Vercel Deployment Protection is enabled, provide its automation bypass through Secret Manager as documented in `infra/README.md`. The API declares a 300-second maximum duration; confirm the Vercel plan supports that duration before enabling execution.

## Local verification

```sh
npm ci
npm test
npm run test:vercel
npm run build
bash scripts/verify-vercel.sh
```

The production-server check uses a temporary local libSQL file, applies migrations twice, verifies authenticated draft editing and artwork round trips, rejects forged identity headers, checks session tampering and rate limiting, and confirms financial execution stays disabled. It never signs or broadcasts a network transaction.

The existing Sites target remains available through `npm run dev:sites` and `npm run build:sites`.

Official references: [Vercel GitHub imports](https://vercel.com/docs/git/vercel-for-github), [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying), [Turso TypeScript client and atomic batches](https://docs.turso.tech/sdk/ts/reference).
