#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v surfpool >/dev/null || { echo 'Surfpool 1.5.0 is required.' >&2; exit 1; }
run_dir=$(mktemp -d)
rpc_pid=''
cleanup() {
  if [[ -n "$rpc_pid" ]]; then kill "$rpc_pid" 2>/dev/null || true; fi
  rm -rf "$run_dir"
}
trap cleanup EXIT
# Only this loopback RPC accepts simulations and fake-account changes. The remote
# source is read-only; this script never signs or sends network transactions.
(cd "$run_dir" && exec env NO_DNA=1 surfpool start --network mainnet --host 127.0.0.1 --port 8988 --ws-port 8989 --no-deploy --ci --skip-signature-verification --skip-blockhash-check --airdrop-amount 0) >"$run_dir/server.log" 2>&1 &
rpc_pid=$!
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if ! kill -0 "$rpc_pid" 2>/dev/null; then cat "$run_dir/server.log"; exit 1; fi
  if curl --silent --fail --max-time 2 -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' http://127.0.0.1:8988 | grep -q '"ok"'; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then cat "$run_dir/server.log"; exit 1; fi
node scripts/audit/protocol.cjs
