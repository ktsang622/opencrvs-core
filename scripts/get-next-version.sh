#!/bin/bash
# get-next-version.sh - Get next version for a specific module
#
# Usage: ./scripts/get-next-version.sh <module> [BASE_VERSION]
#
# Queries ECR for existing tags and returns the next build number for the module.
# If no existing tags found, starts at .1
#
# Example:
#   ./scripts/get-next-version.sh gateway demo-1.8.0
#   Output: demo-1.8.0.4  (if demo-1.8.0.3 exists in ECR)

set -e

MODULE="${1:?Module name required}"
BASE_VERSION="${2:-${BASE_VERSION:-demo-1.8.0}}"

# AWS/ECR Configuration
AWS_REGION="${AWS_REGION:-ap-east-1}"
AWS_ACCOUNT="${AWS_ACCOUNT:-695491315778}"
ECR_REPO_PREFIX="${ECR_REPO_PREFIX:-toppancrvs}"
ECR_REGISTRY="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Full repo name
REPO_NAME="${ECR_REPO_PREFIX}/${MODULE}"

# Try to get existing tags from ECR
get_latest_build_number() {
  # Query ECR for image tags matching the base version pattern
  # Example: demo-1.8.0.1, demo-1.8.0.2, demo-1.8.0.15

  TAGS=$(aws ecr list-images \
    --repository-name "$REPO_NAME" \
    --region "$AWS_REGION" \
    --query "imageIds[?starts_with(imageTag, '${BASE_VERSION}.')].imageTag" \
    --output text 2>/dev/null || echo "")

  if [ -z "$TAGS" ]; then
    echo "0"
    return
  fi

  # Find the highest build number
  HIGHEST=0
  for tag in $TAGS; do
    # Extract build number from tag (e.g., "demo-1.8.0.15" → "15")
    BUILD_NUM=$(echo "$tag" | sed "s/^${BASE_VERSION}\.//" | grep -E '^[0-9]+$' || echo "0")
    if [ "$BUILD_NUM" -gt "$HIGHEST" ] 2>/dev/null; then
      HIGHEST=$BUILD_NUM
    fi
  done

  echo "$HIGHEST"
}

# Check if we can reach ECR
check_ecr_access() {
  aws ecr describe-repositories \
    --repository-names "$REPO_NAME" \
    --region "$AWS_REGION" \
    > /dev/null 2>&1
  return $?
}

# Main logic
if check_ecr_access; then
  CURRENT=$(get_latest_build_number)
  NEXT=$((CURRENT + 1))
else
  # ECR not accessible, fall back to local tracking file
  VERSION_FILE=".module-versions.json"

  if [ -f "$VERSION_FILE" ]; then
    CURRENT=$(jq -r ".\"$MODULE\" // 0" "$VERSION_FILE" 2>/dev/null || echo "0")
  else
    CURRENT=0
  fi
  NEXT=$((CURRENT + 1))

  # Update local file
  if [ -f "$VERSION_FILE" ]; then
    jq ".\"$MODULE\" = $NEXT" "$VERSION_FILE" > "${VERSION_FILE}.tmp" && mv "${VERSION_FILE}.tmp" "$VERSION_FILE"
  else
    echo "{\"$MODULE\": $NEXT}" > "$VERSION_FILE"
  fi

  echo "Warning: ECR not accessible, using local version file" >&2
fi

# Output the next version
echo "${BASE_VERSION}.${NEXT}"
