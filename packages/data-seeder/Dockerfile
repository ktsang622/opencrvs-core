ARG BRANCH=develop
FROM opencrvs/ocrvs-base:${BRANCH}

USER node

# Copy full repo (or at least needed packages)
COPY --chown=node:node . /app

WORKDIR /app

# Install all dependencies with Yarn (workspace-aware)
RUN yarn install --frozen-lockfile

# Move into data-seeder
WORKDIR /app/packages/data-seeder


# Default run command with dynamic country support
CMD ["sh", "-c", "yarn seed --country=${COUNTRY}"]
