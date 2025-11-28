#!/bin/bash
# Build a countryconfig repository with the local @opencrvs/toolkit (PDF support)
# Usage: ./build-countryconfig.sh [VERSION] [DOCKER_REGISTRY] [--country=<name>]
#
# This script:
# 1. Builds the @opencrvs/toolkit package from local source
# 2. Packs it as a tarball inside the selected countryconfig repo
# 3. Installs dependencies (to pick up the new toolkit)
# 4. Builds the Docker image for the selected countryconfig service
#
# --country argument:
#   - Defaults to "countryconfig" (the baseline repo/service)
#   - Example: --country=atg  -> uses opencrvs-countryconfig-atg, service countryconfig-atg

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"$SCRIPT_DIR/scripts/countryconfig-pack-toolkit.sh" "$@"
"$SCRIPT_DIR/scripts/countryconfig-build-image.sh" "$@"
