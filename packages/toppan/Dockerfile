ARG VERSION=1.8.1-demo
FROM opencrvs-base:${VERSION}

USER node

WORKDIR /app/packages/toppan
COPY --chown=node:node packages/toppan/*.json /app/packages/toppan/
RUN yarn install --frozen-lockfile
COPY --chown=node:node packages/toppan /app/packages/toppan
RUN yarn build

EXPOSE 9998

CMD ["yarn", "start:prod"]