#!/bin/bash
# Test certificate service API with realistic OpenCRVS data

echo "Testing Certificate Service API..."
echo "=================================="
echo ""

RESPONSE=$(curl -s -X POST http://localhost:3890/api/certificates/generate \
  -H "Content-Type: application/json" \
  -d '{
    "certificateType": "birth",
    "templateName": "Birth",
    "registrationNumber": "2024/B/001234",
    "trackingId": "B123456",
    "qrData": "https://crvs.gov.ag/verify/2024-B-001234",
    "parish": "St. John",
    "child": {
      "firstName": "John",
      "middleName": "Michael",
      "lastName": "Smith",
      "dateOfBirth": "15 Jan 2024",
      "placeOfBirth": "Mount St. John Medical Centre",
      "gender": "Male"
    },
    "mother": {
      "firstName": "Mary",
      "lastName": "Smith",
      "dateOfBirth": "10 Mar 1990",
      "occupation": "Nurse",
      "nationality": "Antiguan"
    },
    "father": {
      "firstName": "Robert",
      "lastName": "Smith",
      "dateOfBirth": "15 Jul 1988",
      "occupation": "Engineer",
      "nationality": "Antiguan"
    },
    "registrationDate": "20 Jan 2024",
    "informant": {
      "relationship": "Mother"
    },
    "amendments": []
  }')

echo "Response:"
echo "$RESPONSE" | jq '.'
echo ""
echo "HTTP Background Image Loading:"
docker logs certificate-service 2>&1 | tail -10 | grep -E "(Pre-loading|Loaded.*background)"
echo ""
echo "Generated Files:"
ls -lh packages/toppan-certificate/output-debug/2024-B-001234/ 2>/dev/null
