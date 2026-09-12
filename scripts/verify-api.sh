#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
port=4173
log=$(mktemp)
server_pid=''
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
  rm -f "$log"
}
trap cleanup EXIT
npx wrangler d1 migrations apply DB --local --config wrangler.local.json
node node_modules/vinext/dist/cli.js dev --port "$port" >"$log" 2>&1 &
server_pid=$!
ready=false
for ((attempt=0; attempt<90; attempt++)); do
  if ! kill -0 "$server_pid" 2>/dev/null; then cat "$log"; exit 1; fi
  if curl --silent --fail --max-time 2 "http://localhost:$port/api/loop/config" >/dev/null; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then cat "$log"; exit 1; fi
LOOP_TEST_ORIGIN="http://localhost:$port" npm run test:api || { cat "$log"; exit 1; }
