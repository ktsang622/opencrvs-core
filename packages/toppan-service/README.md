# Toppan Service

Backend service for Toppan family tree functionality, migrated from the standalone family-tree service.

## Features

- **Family Tree API**: Initialize and expand family tree nodes
- **Person Search**: OpenSearch-based person search with multiple search modes
- **Person Events**: Retrieve person events and event participants
- **Person Relationships**: Get relationship data for persons

## API Endpoints

### Health Check
- `GET /ping` - Service health check

### Family Tree
- `GET /tree/init/{person_id}` - Initialize family tree for a person
- `POST /tree/expand` - Expand family tree node

### Person Search
- `POST /person-search` - Search for persons
- `POST /person-search/detailed` - Detailed person search

### Person Events
- `GET /person/{personId}/events` - Get person events
- `GET /person/{personId}/relationships` - Get person relationships
- `GET /event/{eventId}/participants` - Get event participants

## Environment Variables

- `TOPPAN_DB_HOST` - Database host (default: localhost)
- `TOPPAN_DB_PORT` - Database port (default: 5432)
- `TOPPAN_DB_NAME` - Database name (default: person_registry)
- `TOPPAN_DB_USER` - Database user (default: registry_user)
- `TOPPAN_DB_PASSWORD` - Database password (default: registry_pass)
- `OSHOST` - OpenSearch host (default: http://localhost:9200)
- `OPENSEARCH_ADMIN_PASSWORD` - OpenSearch admin password
- `PORT` - Service port (default: 3040)
- `HOST` - Service host (default: 0.0.0.0)

## Development

```bash
# Install dependencies
yarn install

# Start development server
yarn dev

# Build for production
yarn build

# Start production server
yarn start
```