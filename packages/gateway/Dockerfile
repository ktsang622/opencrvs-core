ARG VERSION=1.8.1-demo
FROM opencrvs-base:${VERSION}

USER node

COPY --chown=node:node packages/events /app/packages/events

WORKDIR /app/packages/gateway
COPY --chown=node:node packages/gateway/*.json /app/packages/gateway/

RUN yarn install --frozen-lockfile
COPY --chown=node:node packages/gateway /app/packages/gateway
RUN yarn build

CMD [ "yarn", "start:prod" ]
