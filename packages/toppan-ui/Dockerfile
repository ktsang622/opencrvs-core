FROM node:18-alpine

WORKDIR /app

# Copy workspace files for local package resolution
COPY package.json yarn.lock ./
COPY packages/toppan-ui/package*.json ./packages/toppan-ui/
COPY packages/toppan-common ./packages/toppan-common/

# Install dependencies (workspace will resolve local packages)
RUN yarn install --frozen-lockfile

# Copy toppan-ui source code
COPY packages/toppan-ui ./packages/toppan-ui/

# Set working directory to toppan-ui
WORKDIR /app/packages/toppan-ui

# Build the application
RUN yarn build

# Expose port
EXPOSE 3889

# Make start script executable
RUN chmod +x start.sh

# Start the application
CMD ["./start.sh"]