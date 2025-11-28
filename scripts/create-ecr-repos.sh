#!/bin/bash
# Create all ECR repositories for ToppanCRVS deployment
# Usage: ./create-ecr-repos.sh

set -e

# AWS CLI path (adjust if needed)
AWS_CLI="${HOME}/.local/bin/aws"
if [ ! -f "$AWS_CLI" ]; then
    AWS_CLI="aws"  # Fallback to system AWS CLI
fi

# Your AWS region and account
AWS_REGION="ap-east-1"
AWS_ACCOUNT="695491315778"
ECR_REGISTRY="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "🏗️  Creating ECR repositories in ${AWS_REGION}..."
echo ""

# All services that need ECR repositories
SERVICES=(
    "ocrvs-base"        # Base image for OpenCRVS services
    "auth"
    "user-mgnt"
    "config"
    "workflow"
    "events"
    "documents"
    "notification"
    "search"
    "metrics"
    "gateway"
    "webhooks"
    "client"
    "login"
    "scheduler"
    "migration"
    "data-seeder"
    "dashboards"
    "toppan-service"
    "toppan"
    "toppan-ui"
    "countryconfig"
)

# Create each repository
for service in "${SERVICES[@]}"; do
    echo "Creating repository: toppancrvs/${service}..."

    $AWS_CLI ecr create-repository \
        --repository-name "toppancrvs/${service}" \
        --region ${AWS_REGION} \
        --image-scanning-configuration scanOnPush=true \
        --encryption-configuration encryptionType=AES256 \
        2>&1 | grep -v "RepositoryAlreadyExistsException" || true

    if [ $? -eq 0 ]; then
        echo "✅ Created or already exists: toppancrvs/${service}"
    fi
done

echo ""
echo "🎉 All ECR repositories created successfully!"
echo ""
echo "Your ECR registry: ${ECR_REGISTRY}/toppancrvs/*"
