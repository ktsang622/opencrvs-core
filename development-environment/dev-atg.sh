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

# Capture the current .env so we can restore it afterwards.
if [ -f "$DEFAULT_ENV" ]; then
  BACKUP_ENV=$(mktemp "$ROOT_DIR/.env.backup.XXXXXX")
  cp "$DEFAULT_ENV" "$BACKUP_ENV"
else
  BACKUP_ENV=""
fi

trap restore_env EXIT INT TERM

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
  yarn run start2
  exit 0
fi

yarn dev:secrets:gen
concurrently \
  "yarn run start2" \
  "yarn compose:deps-atg"
