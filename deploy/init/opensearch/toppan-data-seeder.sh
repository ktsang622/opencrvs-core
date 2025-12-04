#!/bin/bash
set -e

echo "Starting OpenSearch data seeder..."

OPENSEARCH_URL="http://opensearch:9200"
AUTH=""

echo "Waiting for OpenSearch to be ready at ${OPENSEARCH_URL}..."
echo "Initial 10 second delay for OpenSearch startup..."
sleep 10

# Wait for OpenSearch to be ready
until curl -s $AUTH "${OPENSEARCH_URL}/_cluster/health" > /dev/null; do
  echo "OpenSearch not ready, waiting..."
  echo "Debug: Testing without auth..."
  curl -v "${OPENSEARCH_URL}/_cluster/health" || true
  echo "Debug: Testing with auth..."
  curl -v $AUTH "${OPENSEARCH_URL}/_cluster/health" || true
  sleep 10
done
echo "OpenSearch is ready!"

# Check if already initialized
echo "Checking if person_read alias already exists..."
if curl -s $AUTH "${OPENSEARCH_URL}/person_read" | grep -q '"error"'; then
  echo "person_read alias does not exist, proceeding with initialization..."
else
  echo "person_read alias already exists, exiting"
  exit 0
fi

echo "Creating index template..."
# Add template
curl -X PUT $AUTH "${OPENSEARCH_URL}/_index_template/person_template" \
  -H "Content-Type: application/json" \
  -d @/init/index_template/person_template.json

# Create index with timestamp to allow for future rotation
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
INDEX_NAME="person_index_${TIMESTAMP}"

echo "Creating index: ${INDEX_NAME}..."
# Create index
curl -X PUT $AUTH "${OPENSEARCH_URL}/${INDEX_NAME}"

echo "Importing bulk data..."
# Import data
curl -X POST $AUTH "${OPENSEARCH_URL}/${INDEX_NAME}/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @/init/test_data/test_person_bulk_100K.json

echo "Importing special data..."
curl -X POST $AUTH "${OPENSEARCH_URL}/${INDEX_NAME}/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @/init/test_data/test_person_special_all.json

echo "Creating aliases..."
# Create aliases
curl -X POST $AUTH "${OPENSEARCH_URL}/_aliases" \
  -H "Content-Type: application/json" \
  -d "{\"actions\":[{\"add\":{\"index\":\"${INDEX_NAME}\",\"alias\":\"person_write\"}}]}"

curl -X POST $AUTH "${OPENSEARCH_URL}/_aliases" \
  -H "Content-Type: application/json" \
  -d '{"actions":[{"add":{"indices":["person_index_*","test_person*"],"alias":"person_read"}}]}'

echo "Seeding complete!"