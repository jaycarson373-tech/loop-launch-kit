# Loop signing and keeper services

The signer provisions a distinct Google Cloud KMS Ed25519 key for each launch. Wallet private keys never enter the app, container filesystem, source repository, or browser. The service uses Google Application Default Credentials; deploy with an attached workload service account, not a downloaded service-account private-key file.

Create a dedicated KMS key ring and grant the workload service account only the key creation, public-key read and asymmetric-sign permissions needed in that ring. Run this container behind HTTPS and keep `LOOP_SIGNER_TOKEN` in the platform secret manager. The token must be at least 32 random characters and match the Site's secret. Configure `LOOP_KMS_KEY_RING=projects/PROJECT/locations/LOCATION/keyRings/loop`.

Configure `LOOP_TREASURY_KMS_KEY_VERSION` if the signer should execute the main token's treasury stream. Its public address must match `LOOP_TREASURY_ADDRESS` on both services. An existing personal wallet cannot be signed by KMS: use an operator-controlled managed treasury and explicitly fund it. Never import a personal seed phrase.

`POST /v1/wallets` takes `{launchId,payout}`. Provisioning is idempotent by launch UUID. The payout address is stored as key metadata and is immutable. `POST /v1/sign` takes `{launchId,address,transaction}` and returns `{signedTransaction}`. It never broadcasts. The service checks the fee payer, supported program set, single-signer constraint and payout destinations; the Site validates the returned signature and unchanged message before broadcast. These checks are not an independent smart-contract audit.

The separate runner calls the authenticated Site keeper endpoint serially. Deploy it as a continuously running process with `LOOP_SITE_ORIGIN` and `LOOP_KEEPER_TOKEN`. A private Sites deployment also requires an approved private connectivity/access path: the keeper bearer token authenticates the application but does not bypass the Sites audience gate. Do not make the site public merely to run the keeper. You can run the same `processLaunch` logic in a platform worker with direct D1/R2 access when production infrastructure is configured.

Build: `docker build -f keeper/Dockerfile -t loop-signer .`.
Run signer: `npm run signer`.
Run poller: `npm run keeper`.
