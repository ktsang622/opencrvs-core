ARG VERSION=1.8.1-demo
FROM opencrvs-base:${VERSION}

USER node

WORKDIR /app/packages/webhooks
COPY --chown=node:node packages/webhooks /app/packages/webhooks
RUN yarn install --frozen-lockfile && yarn build

CMD [ "yarn", "start:prod" ]
