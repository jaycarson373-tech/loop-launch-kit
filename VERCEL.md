# Import Loop into Vercel

Import **https://github.com/jaycarson373-tech/loop-launch-kit** and select branch `main`.

The repository is private. Sign in to Vercel with the GitHub account that can access it. If it is missing from the import list, use **Adjust GitHub App Permissions** and grant Vercel access to `loop-launch-kit`. A repository URL alone does not grant access.

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

The site builds and displays without secrets. Saving launch plans and artwork requires a database and an operator login. Missing settings produce a setup message rather than pretending data was saved.

1. Create a Turso libSQL database. Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to the Vercel project's environment variables. Do not use a `file:` URL on Vercel: its filesystem is temporary.
2. Generate **two different** secret values with `openssl rand -hex 32`. Set one as `LOOP_ADMIN_PASSWORD` and the other as `LOOP_SESSION_SECRET`. Keep them in a password manager. The login is for the private operator workspace, not public user registration.
3. In a trusted local checkout, set the database URL/token in your shell and run `npm ci` then `npm run db:migrate`. This applies the existing launch/ledger schema and artwork table transactionally; running it again preserves data. Never put secrets in Git or a command you plan to share.
4. Redeploy in Vercel after setting the environment variables. Open `/signin` and enter `LOOP_ADMIN_PASSWORD`. Connect a Solana wallet to create a draft, upload artwork, save it, and reload to confirm persistence.

Use a separate database and credentials for Vercel Preview deployments. The build intentionally does **not** migrate or modify production data. Existing Sites D1/R2 records remain on Sites; this configuration starts a separate workspace and does not transfer existing records.

Database records and uploaded artwork are both stored in Turso. There is no Cloudflare binding, browser-only persistence fallback, or dependency on the Sites authentication gateway in the Vercel runtime. Transactions remain atomic through libSQL write batches. Session cookies are signed, expire after eight hours, and are HttpOnly, SameSite=Strict and Secure on HTTPS. Login attempts are limited in persistent storage. Rotating the session secret invalidates all sessions. Vercel ignores all `oai-authenticated-user-id` headers from clients.

The public dashboard can be viewed without login; records, artwork and operational endpoints require authentication. Keep Vercel Deployment Protection enabled if you want the entire website private. A private GitHub repository does not make its deployed website private.

## Financial execution

Importing and deploying does not activate token launches or spend funds. Keep `LOOP_EXECUTION_ENABLED=false` until the managed signer, RPC, treasury, keeper and funded acceptance are complete. See `config/site.env.example`, `infra/README.md`, and `LAUNCH_READINESS.md`.

The keeper must run as the existing continuously running service, pointed at the Vercel URL. Vercel cron is not a replacement for the engine's seconds-level polling. If Deployment Protection is enabled, the keeper also needs an approved protection bypass in addition to its application bearer token. The API declares a 300-second maximum duration; confirm the Vercel plan supports that duration before enabling execution.

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
