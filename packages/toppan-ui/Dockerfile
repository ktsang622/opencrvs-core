FROM node:18-slim

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json yarn.lock ./

# Copy toppan-common (dependency)
COPY packages/toppan-common/ ./packages/toppan-common/
WORKDIR /app/packages/toppan-common
RUN yarn install --frozen-lockfile && yarn build

# Build main toppan-ui service
WORKDIR /app/packages/toppan-ui
COPY packages/toppan-ui/package.json ./
RUN yarn install --frozen-lockfile
COPY packages/toppan-ui/ ./
RUN yarn build

EXPOSE 3889

CMD ["yarn", "start:prod"]