FROM node:18-slim

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json yarn.lock ./

# Copy toppan-common (dependency)
COPY packages/toppan-common/ ./packages/toppan-common/
WORKDIR /app/packages/toppan-common
RUN yarn install --frozen-lockfile && yarn build

# Copy toppan-db (dependency)
WORKDIR /app
COPY packages/toppan-db/ ./packages/toppan-db/
WORKDIR /app/packages/toppan-db
RUN yarn install --frozen-lockfile && yarn build

# Build main toppan-service
WORKDIR /app/packages/toppan-service
COPY packages/toppan-service/package.json ./
RUN yarn install --frozen-lockfile
COPY packages/toppan-service/ ./
COPY packages/toppan-service/prod.env .env
RUN yarn build

EXPOSE 3888

CMD ["yarn", "start:prod"]
