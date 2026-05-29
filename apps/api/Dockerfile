# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy lockfile + workspace manifests for cache-friendly install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/crawler/package.json packages/crawler/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY packages/crawler packages/crawler
COPY apps/api apps/api

WORKDIR /repo/apps/api
RUN pnpm build

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

ENV NODE_ENV=production
ENV PORT=3001

# Bring over the workspace manifests + sources needed for prod-only install.
# (The api bundle pulls workspace packages from source, so we keep them.)
COPY --from=builder /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml /repo/package.json /repo/tsconfig.base.json ./
COPY --from=builder /repo/packages packages
COPY --from=builder /repo/apps/api/package.json apps/api/
COPY --from=builder /repo/apps/api/dist apps/api/dist

# Install only prod deps for the api filter
RUN pnpm install --prod --frozen-lockfile --filter @smanga/api... \
 && pnpm store prune

EXPOSE 3001

# Health check — Railway can also be configured to hit /api/v1/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3001}/api/v1/health || exit 1

CMD ["node", "apps/api/dist/main.js"]
