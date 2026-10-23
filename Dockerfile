ARG APP_VERSION=1.2.0
ARG GIT_COMMIT=unknown

FROM node:24-bookworm-slim AS build

WORKDIR /app
ENV npm_config_nodedir=/usr/local
RUN apt-get update \
  && apt-get install --yes --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY tsconfig.base.json vitest.config.ts eslint.config.js .prettierrc.json ./
COPY apps apps
COPY packages packages
RUN npm run build \
  && rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && npm ci --omit=dev --workspaces --include-workspace-root

FROM node:24-bookworm-slim AS runtime

ARG APP_VERSION
ARG GIT_COMMIT
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/spotter.sqlite \
    MEDIA_PATH=/data/media \
    APP_VERSION=${APP_VERSION} \
    GIT_COMMIT=${GIT_COMMIT}
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/node_modules ./packages/shared/node_modules

RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "apps/server/dist/index.js"]
