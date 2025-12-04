#!/bin/bash

# Wait for OpenSearch to be ready
echo "Waiting for OpenSearch to be ready..."
until curl -s "http://opensearch:9200/_cluster/health" > /dev/null; do
  echo "OpenSearch is unavailable - sleeping"
  sleep 5
done

echo "OpenSearch is ready!"

# Check if person_read alias already exists
if curl -s "http://opensearch:9200/person_read" | grep -q "person_read"; then
  echo "person_read alias already exists, skipping initialization"
  exit 0
fi

# Add index template
echo "Adding person index template..."
curl -X PUT "http://opensearch:9200/_index_template/person_template" \
  -H "Content-Type: application/json" \
  -d @/init/index_template/person_template.json

# Create index with timestamp to allow for future rotation
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
INDEX_NAME="person_index_2025"

echo "Creating index: ${INDEX_NAME}..."
curl -X PUT "http://opensearch:9200/${INDEX_NAME}"

# Import bulk data
echo "Importing test_person_bulk_100K.json..."
curl -X POST "http://opensearch:9200/${INDEX_NAME}/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @/init/test_data/test_person_bulk_100K.json

echo "Importing test_person_special_all.json..."
curl -X POST "http://opensearch:9200/${INDEX_NAME}/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @/init/test_data/test_person_special_all.json

# Create aliases
echo "Creating person_write alias..."
curl -X POST "http://opensearch:9200/_aliases" \
  -H "Content-Type: application/json" \
  -d "{
    \"actions\": [
      {
        \"add\": {
          \"index\": \"${INDEX_NAME}\",
          \"alias\": \"person_write\"
        }
      }
    ]
  }"

echo "Creating person_read alias for all person indexes..."
curl -X POST "http://opensearch:9200/_aliases" \
  -H "Content-Type: application/json" \
  -d '{
    "actions": [
      {
        "add": {
          "indices": ["person_index_*", "test_person*"],
          "alias": "person_read"
        }
      }
    ]
  }'

echo "OpenSearch initialization complete!"