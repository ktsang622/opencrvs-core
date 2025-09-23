#!/bin/bash
# Shell helper to launch OpenCRVS in Antigua & Barbuda configuration without
# overwriting the default FAR environment. It temporarily swaps the root .env
# file with atg.env and restores the original once the script exits.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
ATG_ENV="$ROOT_DIR/atg.env"
DEFAULT_ENV="$ROOT_DIR/.env"
BACKUP_ENV=""

if [ ! -f "$ATG_ENV" ]; then
  echo "atg.env not found at $ATG_ENV. Please create it before running dev-atg." >&2
  exit 1
fi

restore_env() {
  if [ -n "$BACKUP_ENV" ] && [ -f "$BACKUP_ENV" ]; then
    mv "$BACKUP_ENV" "$DEFAULT_ENV"
  else
    rm -f "$DEFAULT_ENV"
  fi
}

# Enhanced cleanup function for logging
cleanup_logs() {
  # If LOG_DIR is set and contains a PID file, try to clean up gracefully
  if [ -n "${LOG_DIR:-}" ] && [ -f "${LOG_DIR}/dev-atg.pid" ]; then
    local pid=$(cat "${LOG_DIR}/dev-atg.pid" 2>/dev/null || echo "")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "Stopping OpenCRVS services (PID: $pid)..."
      kill "$pid" 2>/dev/null || true
      sleep 2
      # Force kill if still running
      kill -9 "$pid" 2>/dev/null || true
    fi
    echo "$(date -Iseconds): ATG session terminated" >> "${LOG_DIR}/session-info.log"
  fi
}

# Capture the current .env so we can restore it afterwards.
if [ -f "$DEFAULT_ENV" ]; then
  BACKUP_ENV=$(mktemp "$ROOT_DIR/.env.backup.XXXXXX")
  cp "$DEFAULT_ENV" "$BACKUP_ENV"
else
  BACKUP_ENV=""
fi

trap 'cleanup_logs; restore_env' EXIT INT TERM

cp "$ATG_ENV" "$DEFAULT_ENV"
export COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-docker-atg.env}
export COMPOSE_DEPS_FILE=${COMPOSE_DEPS_FILE:-docker-compose.atg-deps.yml}
export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-opencrvs-atg}

dependencies=false
services=false

for arg in "$@"; do
  case $arg in
    --only-dependencies)
      dependencies=true
      ;;
    --only-services)
      services=true
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

if $dependencies; then
  yarn compose:deps-atg
  exit 0
fi

if $services; then
  yarn dev:secrets:gen

  echo
  openCRVSPorts=( 3447 9200 27017 6379 8086 4444 3040 5050 2020 7070 9090 1050 3030 3000 3020 2525 2021 3535 3536 9050 9998 3888 3889)
  for x in "${openCRVSPorts[@]}"
  do
     :
      if lsof -nP -iTCP:$x -sTCP:LISTEN -iUDP:$x >/dev/null; then
        echo -e "OpenCRVS thinks that port: $x is in use by another application.\r"
        echo "You need to find out which application is using this port and quit the application."
        echo "You can find out the application by running:"
        echo "lsof -nP -iTCP:$x -sTCP:LISTEN -iUDP:$x"
        exit 1
      else
          echo -e "$x \033[32m port is available!\033[0m :)"
      fi
  done

  echo "Waiting for dependencies to be ready..."
  wait-on tcp:27017 tcp:6379 tcp:9200 tcp:3447 tcp:8086 tcp:5432 tcp:19200
  echo "Dependencies ready. Starting OpenCRVS services..."

  # Enhanced logging for AI debugging support (services-only mode)
  # Create timestamped log directory for this session
  LOG_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  LOG_DIR="$ROOT_DIR/logs/atg-services-$LOG_TIMESTAMP"
  mkdir -p "$LOG_DIR"

  echo "Creating structured logs in: $LOG_DIR"
  echo "AI agents can read logs from: $LOG_DIR"

  # Start services with comprehensive logging
  # Direct all output to timestamped log file for easy AI access
  yarn run start2 > "$LOG_DIR/all-services.log" 2>&1 &
  START2_PID=$!

  # Store process info for monitoring and cleanup
  echo "$START2_PID" > "$LOG_DIR/dev-atg.pid"
  echo "$(date -Iseconds): ATG services started with PID $START2_PID" > "$LOG_DIR/session-info.log"
  echo "Log directory: $LOG_DIR" >> "$LOG_DIR/session-info.log"
  echo "Command: yarn run start2" >> "$LOG_DIR/session-info.log"
  echo "Mode: services-only" >> "$LOG_DIR/session-info.log"

  # Provide real-time feedback while logging to file
  echo "Services starting in background with PID: $START2_PID"
  echo "Monitor logs with: tail -f $LOG_DIR/all-services.log"
  echo "Or view specific errors: grep -i error $LOG_DIR/all-services.log"
  echo "Parse service logs: yarn logs:parse $LOG_DIR"

  # Create AI-friendly status file for services-only mode
  cat > "$LOG_DIR/ai-debug-info.md" << EOF
# OpenCRVS ATG Debug Information

**Session Started:** $(date -Iseconds)
**PID:** $START2_PID
**Mode:** Services Only (Dependencies Running Separately)
**Command:** yarn run start2

## Quick Debug Commands

\`\`\`bash
# View all service logs
tail -f $LOG_DIR/all-services.log

# Find errors across all services
grep -i error $LOG_DIR/all-services.log

# Parse into individual service logs
yarn logs:parse $LOG_DIR

# View session info
cat $LOG_DIR/session-info.log

# Check if services are still running
ps -p $START2_PID
\`\`\`

## Troubleshooting

1. **Services won't start:** Ensure dependencies are running first
2. **Connection errors:** Check if dependency services are accessible
3. **Environment issues:** Verify atg.env file exists and is valid
4. **Log parsing:** Run \`yarn logs:parse\` to extract per-service logs

EOF

  # Wait for the background process
  wait $START2_PID
  exit 0
fi

yarn dev:secrets:gen

echo
echo -e "\033[32m:::::::::: Stopping any currently running Docker containers ::::::::::\033[0m"
echo
if [[ $(docker ps -aq) ]] ; then
  docker stop $(docker ps -aq)
  sleep 5
fi

echo
openCRVSPorts=( 3447 9200 27017 6379 8086 4444 3040 5050 2020 7070 9090 1050 3030 3000 3020 2525 2021 3535 3536 9050 9998 3888 3889 5555 19200 19600 5432)
for x in "${openCRVSPorts[@]}"
do
   :
    if lsof -nP -iTCP:$x -sTCP:LISTEN -iUDP:$x >/dev/null; then
      echo -e "OpenCRVS thinks that port: $x is in use by another application.\r"
      echo "You need to find out which application is using this port and quit the application."
      echo "You can find out the application by running:"
      echo "lsof -nP -iTCP:$x -sTCP:LISTEN -iUDP:$x"
      exit 1
    else
        echo -e "$x \033[32m port is available!\033[0m :)"
    fi
done

echo
echo -e "\033[32m:::::::::: STARTING OPENCRVS ATG ::::::::::\033[0m"
echo "Starting dependencies..."
yarn compose:deps-atg &

echo "Waiting for dependencies to be ready..."
wait-on tcp:27017 tcp:6379 tcp:9200 tcp:3447 tcp:8086 tcp:5432 tcp:19200

echo "Dependencies ready. Starting OpenCRVS services..."

# Enhanced logging for AI debugging support
# Create timestamped log directory for this session
LOG_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_DIR="$ROOT_DIR/logs/atg-$LOG_TIMESTAMP"
mkdir -p "$LOG_DIR"

echo "Creating structured logs in: $LOG_DIR"
echo "AI agents can read logs from: $LOG_DIR"

# Start services with comprehensive logging
# Direct all output to timestamped log file for easy AI access
yarn run start2 > "$LOG_DIR/all-services.log" 2>&1 &
START2_PID=$!

# Store process info for monitoring and cleanup
echo "$START2_PID" > "$LOG_DIR/dev-atg.pid"
echo "$(date -Iseconds): ATG development environment started with PID $START2_PID" > "$LOG_DIR/session-info.log"
echo "Log directory: $LOG_DIR" >> "$LOG_DIR/session-info.log"
echo "Command: yarn run start2" >> "$LOG_DIR/session-info.log"

# Provide real-time feedback while logging to file
echo "Services starting in background with PID: $START2_PID"
echo "Monitor logs with: tail -f $LOG_DIR/all-services.log"
echo "Or view specific errors: grep -i error $LOG_DIR/all-services.log"
echo "Parse service logs: yarn logs:parse $LOG_DIR"

# Create AI-friendly status file
cat > "$LOG_DIR/ai-debug-info.md" << EOF
# OpenCRVS ATG Debug Information

**Session Started:** $(date -Iseconds)
**PID:** $START2_PID
**Mode:** Full ATG Environment
**Command:** yarn run start2

## Quick Debug Commands

\`\`\`bash
# View all service logs
tail -f $LOG_DIR/all-services.log

# Find errors across all services
grep -i error $LOG_DIR/all-services.log

# Parse into individual service logs
yarn logs:parse $LOG_DIR

# View session info
cat $LOG_DIR/session-info.log

# Check if services are still running
ps -p $START2_PID
\`\`\`

## Troubleshooting

1. **Services won't start:** Check dependency containers are running
2. **Port conflicts:** Check the port availability output above
3. **Environment issues:** Verify atg.env file exists and is valid
4. **Log parsing:** Run \`yarn logs:parse\` to extract per-service logs

EOF

# Wait for the background process
wait $START2_PID
