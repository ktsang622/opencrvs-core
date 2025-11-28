#!/bin/bash

# Install dependencies for the target countryconfig repo and build its Docker
# image using the freshly packed toolkit archive. Mirrors steps 3-4 of
# build-countryconfig.sh

set -euo pipefail

COUNTRY_NAME="countryconfig"
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --country=*)
      COUNTRY_NAME="${1#*=}"
      shift
      ;;
    --country)
      COUNTRY_NAME="${2:-}"
      shift 2
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

set -- "${POSITIONAL[@]}"

VERSION="${1:-latest}"
DOCKER_REGISTRY="${2:-695491315778.dkr.ecr.ap-east-1.amazonaws.com/toppancrvs}"

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "$COUNTRY_NAME" || "$COUNTRY_NAME" == "countryconfig" ]]; then
  REPO_NAME="opencrvs-countryconfig"
  SERVICE_NAME="countryconfig"
else
  REPO_NAME="opencrvs-countryconfig-$COUNTRY_NAME"
  SERVICE_NAME="countryconfig-$COUNTRY_NAME"
fi

COUNTRY_DIR="$SCRIPT_DIR/../$REPO_NAME"
if [[ ! -d "$COUNTRY_DIR" ]]; then
  echo "Error: Country config directory not found: $COUNTRY_DIR" >&2
  exit 1
fi

TOOLKIT_TAR="$COUNTRY_DIR/opencrvs-toolkit.tgz"
if [[ ! -f "$TOOLKIT_TAR" ]]; then
  echo "Error: Toolkit archive not found: $TOOLKIT_TAR" >&2
  echo "Please run scripts/countryconfig-pack-toolkit.sh first." >&2
  exit 1
fi

echo ""
echo ">>> Step 3: Updating $SERVICE_NAME dependencies..."
cd "$COUNTRY_DIR"
yarn install --ignore-engines
echo ">>> Dependencies updated"

echo ""
echo ">>> Step 4: Building Docker image..."
cd "$SCRIPT_DIR"
DOCKER_REGISTRY="$DOCKER_REGISTRY" VERSION="$VERSION" \
  docker compose -f toppan-build-ext.yml build "$SERVICE_NAME"

echo ""
echo "=== Build complete ==="
echo "Image: $DOCKER_REGISTRY/$SERVICE_NAME:$VERSION"
echo ""
echo "To push to ECR:"
echo "  docker push $DOCKER_REGISTRY/$SERVICE_NAME:$VERSION"
