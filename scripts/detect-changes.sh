#!/bin/bash
# detect-changes.sh - Smart change detection for OpenCRVS builds
#
# Usage: ./scripts/detect-changes.sh [BASE_COMMIT]
#
# Returns comma-separated list of services that need rebuilding, or "all" for full rebuild
# Services are output in dependency order (tier order) for sequential building
#
# Exit codes:
#   0 - Changes detected (services printed to stdout)
#   1 - No changes detected
#   2 - Full rebuild required (prints "all")

set -e

BASE_COMMIT="${1:-}"

# If no base commit provided, check for .last_build_commit file
if [ -z "$BASE_COMMIT" ]; then
  if [ -f ".last_build_commit" ]; then
    BASE_COMMIT=$(cat .last_build_commit)
  else
    echo "all"
    exit 2
  fi
fi

# Get list of changed files
CHANGED_FILES=$(git diff --name-only "$BASE_COMMIT"...HEAD 2>/dev/null || echo "")

if [ -z "$CHANGED_FILES" ]; then
  exit 1
fi

# Track which services need rebuilding
declare -A SERVICES_TO_BUILD

# =============================================================================
# Service dependency tiers (must build in this order)
# =============================================================================
# Tier 0: base
# Tier 1: config, auth, notification
# Tier 2: user-mgnt, documents, webhooks
# Tier 3: search, metrics, workflow
# Tier 4: gateway, events
# Tier 5: migration, data-seeder, scheduler, dashboards
# Tier 6: client, login
# Tier 7: toppan-service, toppan, toppan-ui, toppan-certificate
# External: countryconfig, opensearch, toppan-data-seeder

get_service_tier() {
  local svc="$1"
  case "$svc" in
    base) echo 0 ;;
    config|auth|notification) echo 1 ;;
    user-mgnt|documents|webhooks) echo 2 ;;
    search|metrics|workflow) echo 3 ;;
    gateway|events) echo 4 ;;
    migration|data-seeder|scheduler|dashboards) echo 5 ;;
    client|login) echo 6 ;;
    toppan-service|toppan|toppan-ui|toppan-certificate) echo 7 ;;
    countryconfig|opensearch|toppan-data-seeder) echo 8 ;;
    *) echo 9 ;;
  esac
}

# =============================================================================
# Package to Docker service mapping
# Some packages don't have their own Docker image, they're bundled into others
# =============================================================================
package_to_service() {
  local pkg="$1"
  case "$pkg" in
    # These packages have their own Docker images
    auth|client|config|dashboards|data-seeder|documents|events|gateway|login|\
    metrics|migration|notification|scheduler|search|user-mgnt|webhooks|workflow)
      echo "$pkg"
      ;;
    # Toppan services
    toppan)
      echo "toppan"
      ;;
    toppan-service)
      echo "toppan-service"
      ;;
    toppan-ui)
      echo "toppan-ui"
      ;;
    toppan-certificate)
      echo "toppan-certificate"
      ;;
    # Shared packages - trigger rebuild of dependents
    commons|components)
      echo "SHARED"
      ;;
    toppan-common|toppan-db|toppan-integrations)
      echo "TOPPAN_SHARED"
      ;;
    # Packages without Docker images (bundled into others)
    toolkit|gamma|mobile-proxy)
      echo ""
      ;;
    *)
      echo ""
      ;;
  esac
}

# =============================================================================
# Process changed files
# =============================================================================
NEED_FULL_REBUILD=false
NEED_TOPPAN_REBUILD=false

while IFS= read -r file; do
  [ -z "$file" ] && continue

  # Root-level files that affect all builds
  case "$file" in
    package.json|yarn.lock|tsconfig*.json|.nvmrc)
      NEED_FULL_REBUILD=true
      continue
      ;;
    docker-compose*.yml|Dockerfile*|toppan-build*.yml)
      NEED_FULL_REBUILD=true
      continue
      ;;
  esac

  # Check by directory
  case "$file" in
    # Package changes
    packages/*)
      pkg=$(echo "$file" | cut -d'/' -f2)
      service=$(package_to_service "$pkg")

      if [ "$service" = "SHARED" ]; then
        NEED_FULL_REBUILD=true
      elif [ "$service" = "TOPPAN_SHARED" ]; then
        NEED_TOPPAN_REBUILD=true
      elif [ -n "$service" ]; then
        SERVICES_TO_BUILD["$service"]=1
      fi
      ;;

    # Country config changes
    src/*)
      SERVICES_TO_BUILD["countryconfig"]=1
      ;;

    # Infrastructure changes
    infrastructure/*)
      # Infrastructure changes might need specific services
      if [[ "$file" == *"opensearch"* ]]; then
        SERVICES_TO_BUILD["opensearch"]=1
      fi
      ;;

    # Init/migration changes
    init/*)
      SERVICES_TO_BUILD["migration"]=1
      # If it's a database change, might need to rebuild services that embed init
      if [[ "$file" == *"migrations"* ]]; then
        SERVICES_TO_BUILD["data-seeder"]=1
      fi
      ;;

    # Build script changes
    scripts/*)
      # Build scripts don't necessarily need image rebuilds
      # but deployment scripts might
      if [[ "$file" == *"seed"* ]]; then
        SERVICES_TO_BUILD["data-seeder"]=1
        SERVICES_TO_BUILD["toppan-data-seeder"]=1
      fi
      ;;
  esac
done <<< "$CHANGED_FILES"

# =============================================================================
# Handle full rebuild cases
# =============================================================================
if [ "$NEED_FULL_REBUILD" = true ]; then
  echo "all"
  exit 2
fi

# If toppan shared packages changed, add all toppan services
if [ "$NEED_TOPPAN_REBUILD" = true ]; then
  SERVICES_TO_BUILD["toppan"]=1
  SERVICES_TO_BUILD["toppan-service"]=1
  SERVICES_TO_BUILD["toppan-ui"]=1
  SERVICES_TO_BUILD["toppan-certificate"]=1
  SERVICES_TO_BUILD["gateway"]=1  # Gateway imports toppan-db
fi

# =============================================================================
# Output results - SORTED BY TIER for correct build order
# =============================================================================
if [ ${#SERVICES_TO_BUILD[@]} -eq 0 ]; then
  exit 1
fi

# Sort services by tier
SORTED_SERVICES=()
for tier in 0 1 2 3 4 5 6 7 8; do
  for svc in "${!SERVICES_TO_BUILD[@]}"; do
    if [ "$(get_service_tier "$svc")" = "$tier" ]; then
      SORTED_SERVICES+=("$svc")
    fi
  done
done

# Output comma-separated list in tier order
IFS=','
echo "${SORTED_SERVICES[*]}"
exit 0
