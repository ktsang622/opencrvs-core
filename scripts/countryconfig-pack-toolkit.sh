#!/bin/bash

# Build the @opencrvs/toolkit package from local sources and pack it to the
# selected countryconfig repository. Mirrors steps 1-2 of build-countryconfig.sh

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
TOOLKIT_DIR="$SCRIPT_DIR/packages/toolkit"

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

echo "=== Building $SERVICE_NAME with local toolkit ==="
echo "VERSION: $VERSION"
echo "DOCKER_REGISTRY: $DOCKER_REGISTRY"
echo "COUNTRY REPO: $COUNTRY_DIR"
echo ""

echo ">>> Step 1: Building @opencrvs/toolkit..."
cd "$TOOLKIT_DIR"
yarn install --ignore-engines --frozen-lockfile >/dev/null
yarn build
echo ">>> Toolkit built successfully"

echo ""
echo ">>> Step 2: Packing toolkit for $SERVICE_NAME..."
yarn pack --filename "$TOOLKIT_TAR"
echo ">>> Toolkit packed to: $TOOLKIT_TAR"

# Update yarn.lock to match the freshly packed toolkit tarball
if command -v sha1sum >/dev/null 2>&1; then
  SHA1_SUM=$(sha1sum "$TOOLKIT_TAR" | awk '{print $1}')
else
  SHA1_SUM=$(shasum -a 1 "$TOOLKIT_TAR" | awk '{print $1}')
fi
SHA512_B64=$(node -e "const fs=require('fs'); const crypto=require('crypto'); const data=fs.readFileSync(process.argv[1]); process.stdout.write(crypto.createHash('sha512').update(data).digest('base64'));" "$TOOLKIT_TAR")

LOCK_FILE="$COUNTRY_DIR/yarn.lock"
if [[ -f "$LOCK_FILE" ]]; then
  node - "$LOCK_FILE" "$SHA1_SUM" "$SHA512_B64" <<'NODE'
const fs = require('fs');
const lockPath = process.argv[2];
const sha1 = process.argv[3];
const sha512 = process.argv[4];
const lines = fs.readFileSync(lockPath, 'utf8').split('\n');
let inBlock = false;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith('"@opencrvs/toolkit@file:opencrvs-toolkit.tgz"')) {
    inBlock = true;
    continue;
  }
  if (inBlock) {
    if (!line.startsWith('  ') && line.trim() !== '') {
      // Something else without indentation -> exit block
      inBlock = false;
    }
    if (line.includes('resolved "file:opencrvs-toolkit.tgz#')) {
      lines[i] = line.replace(/resolved "file:opencrvs-toolkit\.tgz#[^"]+"/, `resolved "file:opencrvs-toolkit.tgz#${sha1}"`);
    }
    if (line.includes('integrity sha512-')) {
      lines[i] = line.replace(/integrity sha512-[^\s]+/, `integrity sha512-${sha512}`);
    }
    if (line.trim() === '') {
      inBlock = false;
    }
  }
}
fs.writeFileSync(lockPath, lines.join('\n'));
NODE
  echo ">>> Updated yarn.lock checksums"
else
  echo "Warning: yarn.lock not found in $COUNTRY_DIR; skipping checksum update" >&2
fi
