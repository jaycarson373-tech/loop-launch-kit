#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/loop-vercel-check.XXXXXX")
server_pid=''
cleanup() {
  if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  rm -rf "$test_dir"
}
trap cleanup EXIT
export TURSO_DATABASE_URL="file:$test_dir/loop.db"
unset TURSO_AUTH_TOKEN LOOP_RPC_URL LOOP_SIGNER_URL LOOP_SIGNER_TOKEN LOOP_KEEPER_TOKEN LOOP_TREASURY_ADDRESS LOOP_ALLOW_MAINNET
export LOOP_EXECUTION_ENABLED=false
export LOOP_ADMIN_PASSWORD='local-integration-password-000000000000000000000000'
export LOOP_SESSION_SECRET='local-integration-session-key-111111111111111111111'
export LOOP_TEST_PASSWORD="$LOOP_ADMIN_PASSWORD"
export LOOP_TEST_ORIGIN='http://localhost:4174'
# The first authenticated request initializes an empty database automatically.
node node_modules/next/dist/bin/next start --port 4174 > "$test_dir/server.log" 2>&1 &
server_pid=$!
ready=false
for attempt in $(seq 1 60); do
  if curl --fail --silent "$LOOP_TEST_ORIGIN/api/loop/config" > /dev/null; then ready=true; break; fi
  if ! kill -0 "$server_pid" 2>/dev/null; then cat "$test_dir/server.log"; exit 1; fi
  sleep 1
done
if [ "$ready" != true ]; then cat "$test_dir/server.log"; exit 1; fi
curl --fail --silent "$LOOP_TEST_ORIGIN/" > /dev/null
curl --fail --silent "$LOOP_TEST_ORIGIN/signin" > /dev/null
node --experimental-strip-types scripts/check-api.ts || { cat "$test_dir/server.log"; exit 1; }
node --experimental-strip-types scripts/check-vercel-auth.ts || { cat "$test_dir/server.log"; exit 1; }
node --experimental-strip-types scripts/check-wallet-auth.ts || { cat "$test_dir/server.log"; exit 1; }

# Explicit repeat migrations must preserve all persisted state.
npm run db:migrate
npm run db:migrate
