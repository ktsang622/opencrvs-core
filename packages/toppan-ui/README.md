# Toppan UI

React-based UI components for Toppan services, following OpenCRVS patterns.

## Features

- Family Tree visualization
- Person details panel
- Integration with toppan-service APIs

## Development

```bash
# Install dependencies
yarn install

# Start development server (port 3889)
yarn start

# Build for production
yarn build
```

## Usage

Family Tree: `http://localhost:3889/familyTree/{personId}?fulldetails=true`

## Architecture

- **React 18** with **Vite**
- **TypeScript** for type safety
- **Styled Components** for styling
- **React Router** for routing
- **@opencrvs/toppan-common** for shared types