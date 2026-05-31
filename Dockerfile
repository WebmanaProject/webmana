# Shared multi-stage image for all Webmana Node services (api, worker, mcp, web).
# Phase 0: one image, each compose service overrides the command.
# Production-optimized per-service images are a later refinement.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/connectors/package.json ./packages/connectors/
COPY packages/crypto/package.json ./packages/crypto/
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/mcp/package.json ./apps/mcp/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
COPY . .
RUN pnpm run build

# Runtime image keeps the full workspace; the command selects the service.
FROM build AS runtime
ENV NODE_ENV=production
EXPOSE 3000 4000 4100
CMD ["pnpm", "--filter", "@webmana/api", "start"]
