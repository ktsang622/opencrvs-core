#!/bin/bash
# Script for AWS Administrator to create ECR repositories
# Run this with admin AWS credentials
# Usage: ./admin-create-ecr-repos.sh

AWS_REGION="ap-east-1"

# All repositories needed
REPOS=(
    "toppancrvs/ocrvs-base"
    "toppancrvs/auth"
    "toppancrvs/user-mgnt"
    "toppancrvs/config"
    "toppancrvs/workflow"
    "toppancrvs/events"
    "toppancrvs/documents"
    "toppancrvs/notification"
    "toppancrvs/search"
    "toppancrvs/metrics"
    "toppancrvs/gateway"
    "toppancrvs/webhooks"
    "toppancrvs/client"
    "toppancrvs/login"
    "toppancrvs/scheduler"
    "toppancrvs/migration"
    "toppancrvs/data-seeder"
    "toppancrvs/dashboards"
    "toppancrvs/toppan-service"
    "toppancrvs/toppan"
    "toppancrvs/toppan-ui"
    "toppancrvs/countryconfig"
)

echo "Creating ${#REPOS[@]} ECR repositories in ${AWS_REGION}..."
echo ""

for repo in "${REPOS[@]}"; do
    echo "Creating: ${repo}"
    aws ecr create-repository \
        --repository-name "${repo}" \
        --region ${AWS_REGION} \
        --image-scanning-configuration scanOnPush=true \
        --encryption-configuration encryptionType=AES256 \
        2>&1 || echo "  (Repository may already exist)"
done

echo ""
echo "Done! All repositories should now exist."
echo ""
echo "To verify:"
echo "aws ecr describe-repositories --region ${AWS_REGION} | grep toppancrvs"
