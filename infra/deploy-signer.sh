#!/usr/bin/env bash
# Provisions the signing service in an explicitly selected, billing-enabled project.
# Does not sign a transaction, fund a wallet, enable execution or change Site access.
set -euo pipefail
project=${1:?Usage: deploy-signer.sh PROJECT_ID REGION}
region=${2:?Usage: deploy-signer.sh PROJECT_ID REGION}
[[ "$project" =~ ^[a-z][a-z0-9-]{4,61}[a-z0-9]$ ]] || { echo 'Invalid project ID' >&2; exit 1; }
[[ "$region" =~ ^[a-z]+-[a-z]+[0-9]$ ]] || { echo 'Invalid region' >&2; exit 1; }
command -v gcloud >/dev/null || { echo 'Install and sign in to Google Cloud CLI first.' >&2; exit 1; }
cd "$(dirname "$0")/.."
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit and verify the source before deployment.' >&2; exit 1; }
ring="projects/$project/locations/$region/keyRings/loop"
service="loop-signer@$project.iam.gserviceaccount.com"
image="$region-docker.pkg.dev/$project/loop/signer:$(git rev-parse --verify HEAD)"
gcloud projects describe "$project" --format='value(projectId)' >/dev/null
gcloud services enable cloudkms.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project "$project"
if ! gcloud iam service-accounts describe "$service" --project "$project" >/dev/null 2>&1; then
  gcloud iam service-accounts create loop-signer --display-name='Loop signing service' --project "$project"
fi
if ! gcloud kms keyrings describe loop --location "$region" --project "$project" >/dev/null 2>&1; then
  gcloud kms keyrings create loop --location "$region" --project "$project"
fi
if ! gcloud kms keys describe treasury --keyring loop --location "$region" --project "$project" >/dev/null 2>&1; then
  gcloud kms keys create treasury --keyring loop --location "$region" --project "$project" --purpose asymmetric-signing --default-algorithm ec-sign-ed25519 --protection-level software
fi
role="projects/$project/roles/loopSigner"
permissions='cloudkms.keyRings.get,cloudkms.cryptoKeys.create,cloudkms.cryptoKeys.get,cloudkms.cryptoKeyVersions.getPublicKey,cloudkms.cryptoKeyVersions.useToSign'
if gcloud iam roles describe loopSigner --project "$project" >/dev/null 2>&1; then
  gcloud iam roles update loopSigner --project "$project" --permissions "$permissions" --stage GA
else
  gcloud iam roles create loopSigner --project "$project" --title='Loop managed key operations' --permissions "$permissions" --stage GA
fi
gcloud kms keyrings add-iam-policy-binding loop --location "$region" --project "$project" --member "serviceAccount:$service" --role "$role" >/dev/null
for secret in loop-signer-token loop-keeper-token; do
  if ! gcloud secrets describe "$secret" --project "$project" >/dev/null 2>&1; then
    gcloud secrets create "$secret" --replication-policy automatic --project "$project"
    node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("base64url"))' | gcloud secrets versions add "$secret" --project "$project" --data-file=-
  fi
done
gcloud secrets add-iam-policy-binding loop-signer-token --project "$project" --member "serviceAccount:$service" --role roles/secretmanager.secretAccessor >/dev/null
if ! gcloud artifacts repositories describe loop --location "$region" --project "$project" >/dev/null 2>&1; then
  gcloud artifacts repositories create loop --repository-format docker --location "$region" --project "$project"
fi
public_pem=$(mktemp)
trap 'rm -f "$public_pem"' EXIT
gcloud kms keys versions get-public-key 1 --key treasury --keyring loop --location "$region" --project "$project" --output-file "$public_pem"
treasury=$(node --input-type=module - "$public_pem" <<'JS'
import { readFileSync } from 'node:fs';
import { createPublicKey } from 'node:crypto';
import { getBase58Decoder } from '@solana/kit';
const key = createPublicKey(readFileSync(process.argv[2])).export({format:'jwk'});
if (key.crv !== 'Ed25519' || !key.x) throw new Error('Expected Ed25519');
process.stdout.write(getBase58Decoder().decode(Buffer.from(key.x, 'base64url')));
JS
)
gcloud builds submit . --project "$project" --config infra/cloudbuild.yaml --substitutions "_IMAGE=$image"
gcloud run deploy loop-signer --project "$project" --region "$region" --image "$image" --service-account "$service" --port 8080 --min-instances 1 --max-instances 3 --concurrency 10 --timeout 60 --allow-unauthenticated --set-secrets LOOP_SIGNER_TOKEN=loop-signer-token:latest --set-env-vars "LOOP_KMS_KEY_RING=$ring,LOOP_TREASURY_KMS_KEY_VERSION=$ring/cryptoKeys/treasury/cryptoKeyVersions/1,LOOP_TREASURY_ADDRESS=$treasury,LOOP_MAX_BUY_LAMPORTS=1000000000,LOOP_MAX_TRANSFER_LAMPORTS=100000000000"
url=$(gcloud run services describe loop-signer --project "$project" --region "$region" --format='value(status.url)')
printf 'Signer URL: %s\nManaged treasury public address: %s\nExecution remains paused; configure the Site and complete acceptance.\n' "$url" "$treasury"
