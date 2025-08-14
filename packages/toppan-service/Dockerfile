ARG VERSION=1.8.1-demo
FROM opencrvs-base:${VERSION}

USER node

WORKDIR /app/packages/toppan-service
COPY --chown=node:node packages/toppan-service/*.json /app/packages/toppan-service/
RUN yarn install --frozen-lockfile
COPY --chown=node:node packages/toppan-service /app/packages/toppan-service
RUN yarn build

# Make start script executable
RUN chmod +x start.sh

CMD ["./start.sh"]