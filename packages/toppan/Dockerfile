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

# Build main toppan service
WORKDIR /app/packages/toppan
COPY packages/toppan/package.json ./
RUN yarn install --frozen-lockfile
COPY packages/toppan/ ./
COPY packages/toppan/prod.env .env

# Copy init schema from root (single source of truth)
WORKDIR /app
COPY init/database.sql ./packages/toppan/src/init-schema.sql

WORKDIR /app/packages/toppan
RUN yarn build
RUN mkdir -p build/dist/src/migrations \
  && cp src/init-schema.sql build/dist/src/ \
  && if [ -d src/migrations ] && [ "$(ls -A src/migrations/*.sql 2>/dev/null)" ]; then \
       cp src/migrations/*.sql build/dist/src/migrations/; \
     fi

EXPOSE 9998

CMD ["yarn", "start:prod"]
