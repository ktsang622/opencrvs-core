ARG  BRANCH=develop
FROM ghcr.io/opencrvs/ocrvs-base:${BRANCH}

USER node

WORKDIR /app

# Install all dependencies with Yarn (workspace-aware)
RUN yarn install --frozen-lockfile

# Move into data-seeder
WORKDIR /app/packages/data-seeder


# Default run command with dynamic country support
CMD ["sh", "-c", "yarn seed --country=${COUNTRY}"]
