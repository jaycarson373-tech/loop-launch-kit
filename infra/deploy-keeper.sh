#!/usr/bin/env bash
# Deploy only after the site bearer token and approved access path are configured.
set -euo pipefail
project=${1:?Usage: deploy-keeper.sh PROJECT_ID REGION HTTPS_SITE_ORIGIN}
region=${2:?Usage: deploy-keeper.sh PROJECT_ID REGION HTTPS_SITE_ORIGIN}
origin=${3:?Usage: deploy-keeper.sh PROJECT_ID REGION HTTPS_SITE_ORIGIN}
[[ "$project" =~ ^[a-z][a-z0-9-]{4,61}[a-z0-9]$ ]] || exit 1
[[ "$region" =~ ^[a-z]+-[a-z]+[0-9]+$ ]] || exit 1
[[ "$origin" =~ ^https://[a-zA-Z0-9.-]+/?$ ]] || { echo 'Use an HTTPS site origin.' >&2; exit 1; }
command -v gcloud >/dev/null || { echo 'Install and sign in to Google Cloud CLI first.' >&2; exit 1; }
cd "$(dirname "$0")/.."
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit and verify the source first.' >&2; exit 1; }
service="loop-keeper@$project.iam.gserviceaccount.com"
image="$region-docker.pkg.dev/$project/loop/signer:$(git rev-parse --verify HEAD)"
gcloud secrets describe loop-keeper-token --project "$project" >/dev/null
if ! gcloud iam service-accounts describe "$service" --project "$project" >/dev/null 2>&1; then
  gcloud iam service-accounts create loop-keeper --display-name='Loop automation worker' --project "$project"
fi
gcloud secrets add-iam-policy-binding loop-keeper-token --project "$project" --member "serviceAccount:$service" --role roles/secretmanager.secretAccessor >/dev/null
secrets='LOOP_KEEPER_TOKEN=loop-keeper-token:latest'
if [[ -n "${LOOP_VERCEL_BYPASS_SECRET:-}" ]]; then
  [[ "$LOOP_VERCEL_BYPASS_SECRET" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
  gcloud secrets add-iam-policy-binding "$LOOP_VERCEL_BYPASS_SECRET" --project "$project" --member "serviceAccount:$service" --role roles/secretmanager.secretAccessor >/dev/null
  secrets="$secrets,LOOP_VERCEL_BYPASS=$LOOP_VERCEL_BYPASS_SECRET:latest"
fi
gcloud builds submit . --project "$project" --config infra/cloudbuild.yaml --substitutions "_IMAGE=$image"
gcloud run deploy loop-keeper --project "$project" --region "$region" --image "$image" --service-account "$service" --command node --args=--experimental-strip-types,keeper/runner.ts --port 8080 --min-instances 1 --max-instances 1 --no-cpu-throttling --no-allow-unauthenticated --set-secrets "$secrets" --set-env-vars "LOOP_SITE_ORIGIN=$origin"
printf 'Keeper deployed. Verify /health and the site readiness panel before enabling execution.\n'
