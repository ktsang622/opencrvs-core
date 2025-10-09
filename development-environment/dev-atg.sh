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

# Wait for dependencies helper
# Uses npx wait-on if available, otherwise falls back to a simple TCP poll
wait_for_ready() {
  # Usage: wait_for_ready tcp:host:port tcp:host:port ...
  if command -v npx >/dev/null 2>&1; then
    # Prefer npx to avoid global install requirements
    npx --yes wait-on "$@"
    return $?
  fi

  echo "wait-on not available via npx; falling back to simple checks..."
  local max_retries=120 # ~2 minutes
  local sleep_secs=1
  for target in "$@"; do
    local hostport=${target#tcp:}
    local host=${hostport%:*}
    local port=${hostport##*:}
    local count=0
    echo -n "Waiting for $host:$port" 
    until (echo > /dev/tcp/$host/$port) >/dev/null 2>&1; do
      printf '.'
      sleep "$sleep_secs"
      count=$((count+1))
      if [ "$count" -ge "$max_retries" ]; then
        echo ""
        echo "Timeout waiting for $host:$port"
        return 1
      fi
    done
    echo " OK"
  done
}

# Log rotation function with compression
rotate_log_if_needed() {
  local log_file="$1"
  local max_size=${2:-104857600}  # 100MB default

  if [ -f "$log_file" ]; then
    local file_size=$(stat -c%s "$log_file" 2>/dev/null || stat -f%z "$log_file" 2>/dev/null || echo "0")
    if [ "$file_size" -gt "$max_size" ]; then
      local timestamp=$(date +%Y%m%d-%H%M%S)
      echo "$(date -Iseconds): Rotating log file (${file_size} bytes > ${max_size})" >> "${log_file}.rotation.log"

      # Compress and move the current log
      gzip -c "$log_file" > "${log_file}.${timestamp}.gz" && > "$log_file"

      # Keep only last 5 compressed logs to prevent accumulation
      find "$(dirname "$log_file")" -name "$(basename "$log_file").*.gz" -type f | sort -r | tail -n +6 | xargs rm -f 2>/dev/null || true

      echo "Log rotated to: $(basename "${log_file}.${timestamp}.gz")"
      return 0
    fi
  fi
  return 1
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
kill_on_failure=false
started_deps=false

for arg in "$@"; do
  case $arg in
    --only-dependencies)
      dependencies=true
      ;;
    --only-services)
      services=true
      ;;
    --kill-on-failure)
      kill_on_failure=true
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Available options:"
      echo "  --only-dependencies  Start only dependencies"
      echo "  --only-services      Start only services"
      echo "  --kill-on-failure    Kill all services if any service fails"
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
  openCRVSPorts=( 3447 9200 27017 6379 8086 4444 3040 5050 2020 7070 9090 1050 3030 3000 3020 2525 2021 3535 3536 9050 9998 3888 3889 3890)
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
  wait_for_ready tcp:localhost:27017 tcp:localhost:6379 tcp:localhost:9200 tcp:localhost:3447 tcp:localhost:8086 tcp:localhost:35432 tcp:localhost:19200
  echo "Dependencies ready. Starting OpenCRVS services..."

  # Enhanced logging for services-only mode
  LOG_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  LOG_DIR="$ROOT_DIR/logs/atg-services-$LOG_TIMESTAMP"
  mkdir -p "$LOG_DIR"
  ln -sfn "$LOG_DIR" "$ROOT_DIR/logs/atg-current" 2>/dev/null || true

  {
    yarn run start2 2>&1 | while IFS= read -r line; do
      # Write to combined log for overview
      echo "$line" | tee -a "$LOG_DIR/all-services.log"

      # Extract service name and write to service-specific log
      if [[ $line =~ ^@opencrvs/([^:]+):\ (.*)$ ]]; then
        service="${BASH_REMATCH[1]}"
        # Clean service name (remove colors, special chars)
        clean_service=$(echo "$service" | sed 's/\x1b\[[0-9;]*m//g' | tr -d ' ')
        if [ -n "$clean_service" ]; then
          echo "$line" >> "$LOG_DIR/${clean_service}.log"
          rotate_log_if_needed "$LOG_DIR/${clean_service}.log" 10485760 || true
        fi
      else
        echo "$line" >> "$LOG_DIR/general.log"
      fi
    done
  } &
  START2_PID=$!

  # Start certificate-service after countryconfig is ready (background)
  {
    echo "Waiting for countryconfig to be ready before starting certificate-service..."
    wait_for_ready tcp:localhost:3040
    echo "Starting certificate-service (Toppan .NET service)..."
    docker compose -p opencrvs-atg -f "$ROOT_DIR/docker-compose.certificate-service.yml" up -d certificate-service
    echo "Certificate-service started on http://localhost:3890"
  } >> "$LOG_DIR/certificate-service-startup.log" 2>&1 &
  PGID=$(ps -o pgid= $START2_PID | tr -d ' ' || echo "")

  echo "$START2_PID" > "$LOG_DIR/dev-atg.pid"
  [ -n "$PGID" ] && echo "$PGID" > "$LOG_DIR/dev-atg.pgid" || true
  echo "$(date -Iseconds): ATG services-only started with PID $START2_PID" > "$LOG_DIR/session-info.log"
  echo "Log directory: $LOG_DIR" >> "$LOG_DIR/session-info.log"
  echo "Command: yarn run start2" >> "$LOG_DIR/session-info.log"

  # Create AI-friendly status file for services-only mode
  cat > "$LOG_DIR/ai-debug-info.md" << EOF
# OpenCRVS ATG Debug Information

**Session Started:** $(date -Iseconds)
**PID:** $START2_PID
**Mode:** Services Only (Dependencies Running Separately)
**Command:** yarn run start2

## Quick Debug Commands

\`\`\`bash
# View all service logs combined
tail -f $LOG_DIR/all-services.log

# View specific service logs (AI-friendly)
tail -f $LOG_DIR/gateway.log
tail -f $LOG_DIR/user-mgnt.log
tail -f $LOG_DIR/workflow.log

# Find errors in specific service
grep -i error $LOG_DIR/gateway.log

# List all service-specific logs
ls $LOG_DIR/*.log

# View session info
cat $LOG_DIR/session-info.log

# Check if services are still running
ps -p $START2_PID
\`\`\`

## Troubleshooting

1. **Services won't start:** Ensure dependencies are running first
2. **Connection errors:** Check if dependency services are accessible
3. **Environment issues:** Verify atg.env file exists and is valid
4. **Service debugging:** Each service has its own .log file for focused debugging

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
started_deps=true

echo "Waiting for dependencies to be ready..."
wait_for_ready tcp:localhost:27017 tcp:localhost:6379 tcp:localhost:9200 tcp:localhost:3447 tcp:localhost:8086 tcp:localhost:35432 tcp:localhost:19200

echo "Dependencies ready. Starting OpenCRVS services..."

# Enhanced logging for AI debugging support
# Create timestamped log directory for this session
LOG_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_DIR="$ROOT_DIR/logs/atg-$LOG_TIMESTAMP"
mkdir -p "$LOG_DIR"
ln -sfn "$LOG_DIR" "$ROOT_DIR/logs/atg-current" 2>/dev/null || true

echo "Creating structured logs in: $LOG_DIR"
echo "AI agents can read logs from: $LOG_DIR"

# Start services with separate logging per service for AI debugging
# Use a log splitter to write separate service logs immediately
{
  yarn run start2 2>&1 | while IFS= read -r line; do
    # Write to combined log for overview
    echo "$line" | tee -a "$LOG_DIR/all-services.log"

    # Extract service name and write to service-specific log
    if [[ $line =~ ^@opencrvs/([^:]+):\ (.*)$ ]]; then
      service="${BASH_REMATCH[1]}"
      message="${BASH_REMATCH[2]}"

      # Clean service name (remove colors, special chars)
      clean_service=$(echo "$service" | sed 's/\x1b\[[0-9;]*m//g' | tr -d ' ')

      if [ -n "$clean_service" ]; then
        echo "$line" >> "$LOG_DIR/${clean_service}.log"

        # Rotate individual service logs if they get too big
        rotate_log_if_needed "$LOG_DIR/${clean_service}.log" 10485760  # 10MB per service
      fi
    else
      # Lines without service prefix go to general.log
      echo "$line" >> "$LOG_DIR/general.log"
    fi
  done
} &
START2_PID=$!

# Start certificate-service after countryconfig is ready (background)
{
  echo "Waiting for countryconfig to be ready before starting certificate-service..."
  wait_for_ready tcp:localhost:3040
  echo "Starting certificate-service (Toppan .NET service)..."
  docker compose -p opencrvs-atg -f "$ROOT_DIR/docker-compose.certificate-service.yml" up -d certificate-service
  echo "Certificate-service started on http://localhost:3890"
} >> "$LOG_DIR/certificate-service-startup.log" 2>&1 &
PGID=$(ps -o pgid= $START2_PID | tr -d ' ' || echo "")
 
# Store process info for monitoring and cleanup
echo "$START2_PID" > "$LOG_DIR/dev-atg.pid"
[ -n "$PGID" ] && echo "$PGID" > "$LOG_DIR/dev-atg.pgid" || true
echo "$(date -Iseconds): ATG development environment started with PID $START2_PID" > "$LOG_DIR/session-info.log"
echo "Log directory: $LOG_DIR" >> "$LOG_DIR/session-info.log"
echo "Command: yarn run start2" >> "$LOG_DIR/session-info.log"

# Provide real-time feedback while logging to file
echo "Services starting in background with PID: $START2_PID"
echo "Monitor logs with: tail -f $LOG_DIR/all-services.log"
echo "View specific service: tail -f $LOG_DIR/[service-name].log"
echo "Find errors in service: grep -i error $LOG_DIR/[service-name].log"

# Create AI-friendly status file
cat > "$LOG_DIR/ai-debug-info.md" << EOF
# OpenCRVS ATG Debug Information

**Session Started:** $(date -Iseconds)
**PID:** $START2_PID
**Mode:** Full ATG Environment
**Command:** yarn run start2

## Quick Debug Commands

\`\`\`bash
# View all service logs combined
tail -f $LOG_DIR/all-services.log

# View specific service logs (AI-friendly)
tail -f $LOG_DIR/gateway.log
tail -f $LOG_DIR/user-mgnt.log
tail -f $LOG_DIR/workflow.log

# Find errors in specific service
grep -i error $LOG_DIR/gateway.log

# List all service-specific logs
ls $LOG_DIR/*.log

# View session info
cat $LOG_DIR/session-info.log

# Check if services are still running
ps -p $START2_PID
\`\`\`

## Troubleshooting

1. **Services won't start:** Check dependency containers are running
2. **Port conflicts:** Check the port availability output above
3. **Environment issues:** Verify atg.env file exists and is valid
4. **Service debugging:** Each service has its own .log file for focused debugging

EOF

# Wait for the background process
wait $START2_PID || true

# Optionally bring down dependencies if services failed
if $kill_on_failure && $started_deps; then
  echo "Services exited; bringing down dependencies (--kill-on-failure)"
  yarn compose:down:deps-atg || true
fi
