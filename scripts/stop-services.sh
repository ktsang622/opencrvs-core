#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
CURR_LINK="$ROOT_DIR/logs/atg-current"

log(){ echo -e "$@"; }

kill_tree_by_pid(){
  local pid="$1"
  if [ -z "$pid" ]; then return 0; fi
  if kill -0 "$pid" 2>/dev/null; then
    log "• Terminating PID $pid"
    kill -TERM "$pid" 2>/dev/null || true
    sleep 1
    # Kill children
    pkill -TERM -P "$pid" 2>/dev/null || true
    sleep 1
    # As a last resort
    kill -KILL "$pid" 2>/dev/null || true
    pkill -KILL -P "$pid" 2>/dev/null || true
  fi
}

kill_group(){
  local pgid="$1"
  if [ -z "$pgid" ]; then return 0; fi
  log "• Killing process group -$pgid"
  kill -TERM -"$pgid" 2>/dev/null || true
  sleep 1
  kill -KILL -"$pgid" 2>/dev/null || true
}

log "Stopping OpenCRVS ATG services (Node only, keep Docker)"

if [ -L "$CURR_LINK" ] || [ -d "$CURR_LINK" ]; then
  PID_FILE="$CURR_LINK/dev-atg.pid"
  PGID_FILE="$CURR_LINK/dev-atg.pgid"
  if [ -f "$PGID_FILE" ]; then
    PGID=$(cat "$PGID_FILE" || true)
  else
    PGID=""
  fi
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" || true)
  else
    PID=""
  fi

  if [ -n "${PGID:-}" ]; then
    kill_group "$PGID"
  fi
  if [ -n "${PID:-}" ]; then
    kill_tree_by_pid "$PID"
  fi
else
  log "ℹ️  No logs/atg-current link found; using pattern-based stop"
fi

# Targeted fallbacks: kill typical lerna/yarn service runners
pkill -f "lerna run .* start" 2>/dev/null || true
pkill -f "lerna.*start" 2>/dev/null || true
pkill -f "yarn run start2" 2>/dev/null || true
pkill -f "nodemon --exec ts-node" 2>/dev/null || true
pkill -f "ts-node -r tsconfig-paths/register src/index.ts" 2>/dev/null || true

# Final safety net: kill Node listeners on known service ports only
SERVICE_PORTS=(3040 5050 2020 7070 9090 1050 3030 3000 3020 2525 2021 3888 3889 9050 9998)
for port in "${SERVICE_PORTS[@]}"; do
  # Get listeners on this port (tolerate no matches)
  PIDS=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  for pid in $PIDS; do
    # Kill only Node-related listeners to avoid touching Docker deps
    CMDLINE=$(ps -o cmd= -p "$pid" 2>/dev/null || echo "")
    if echo "$CMDLINE" | grep -Eq "node|nodemon|ts-node"; then
      log "• Killing Node listener on :$port (pid=$pid)"
      kill -TERM "$pid" 2>/dev/null || true
      sleep 1
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
done

# If anything still hanging, show a short process list hint
log "Remaining OpenCRVS-related processes (if any):"
if command -v rg >/dev/null 2>&1; then
  ps -eo pid,ppid,pgid,cmd | rg -n "lerna|@opencrvs|toppan-service|search/src/server|user-mgnt|workflow|gateway|nodemon|ts-node" || true
else
  ps -eo pid,ppid,pgid,cmd | grep -E "lerna|@opencrvs|toppan-service|search/src/server|user-mgnt|workflow|gateway|nodemon|ts-node" | grep -v grep || true
fi

log "Done."
