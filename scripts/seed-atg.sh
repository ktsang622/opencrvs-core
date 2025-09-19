#!/bin/bash
# Seed OpenCRVS using the ATG country configuration without disturbing the
# default FAR environment.

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
ATG_ENV_FILE="$ROOT_DIR/atg.env"

if [ ! -f "$ATG_ENV_FILE" ]; then
  echo "atg.env not found at $ATG_ENV_FILE" >&2
  exit 1
fi

# Export variables from atg.env so the seeder hits the ATG services.
set -a
. "$ATG_ENV_FILE"
set +a

export COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-docker-atg.env}
export COMPOSE_DEPS_FILE=${COMPOSE_DEPS_FILE:-docker-compose.atg-deps.yml}
export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-opencrvs-atg}

NODE_ENV=development lerna run seed --stream --scope @opencrvs/data-seeder
