# syntax=docker/dockerfile:1
FROM node:22-slim AS base
WORKDIR /repo
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# ---- deps: production-only install (no devDependencies, no build tooling) ----
# Every workspace's package.json must be present (not just the ones apps/api
# actually depends on) — npm ci reconciles against the *full* root
# package-lock.json, and with only a subset of workspaces on disk it silently
# produces an incomplete install (observed: apps/api's own `js-yaml`
# dependency missing from both the hoisted and nested node_modules, because
# npm couldn't fully resolve the workspace graph).
FROM base AS deps
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/agent-sdk/package.json ./packages/agent-sdk/package.json
COPY packages/cache/package.json ./packages/cache/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/intelligence-engine/package.json ./packages/intelligence-engine/package.json
COPY packages/payments/package.json ./packages/payments/package.json
COPY packages/providers/package.json ./packages/providers/package.json
COPY packages/secrets/package.json ./packages/secrets/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
RUN npm ci --omit=dev

# ---- build: full install + compile (needs devDependencies: typescript, prisma, turbo) ----
FROM base AS build
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm install
RUN npm run db:generate
RUN npx turbo run build --filter=@agentmarket/api...

# ---- runtime: only what's needed to run apps/api ----
FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --system appuser && useradd --system --gid appuser --home /repo appuser

# Production node_modules from `deps`, overlaid with the generated Prisma
# client from `build` (schema-specific query engine — `prisma generate` needs
# the `prisma` devDependency, which `deps` deliberately excludes).
# Copying the whole `/repo` (not just node_modules) also brings along the
# workspace package.json files `deps` used for `npm ci` — without them, the
# `npm install` below finds no package.json/lockfile in this stage, treats
# every workspace symlink in node_modules as extraneous, and prunes them all.
COPY --from=deps /repo ./
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma
# The `prisma` CLI itself (not just the generated @prisma/client) — needed at
# boot to run `prisma migrate deploy` before the server starts serving
# traffic. Installed fresh here (not copied from `build`) so its own
# transitive deps resolve cleanly instead of relying on `build`'s hoisted
# node_modules layout. Pinned to match @prisma/client from the lockfile —
# bump both together.
RUN npm install --no-save prisma@6.19.3
COPY --from=build /repo/packages/database/prisma ./packages/database/prisma

COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist

COPY --from=build /repo/packages/cache/package.json ./packages/cache/package.json
COPY --from=build /repo/packages/cache/dist ./packages/cache/dist
COPY --from=build /repo/packages/config/package.json ./packages/config/package.json
COPY --from=build /repo/packages/config/dist ./packages/config/dist
COPY --from=build /repo/packages/database/package.json ./packages/database/package.json
COPY --from=build /repo/packages/database/dist ./packages/database/dist
COPY --from=build /repo/packages/intelligence-engine/package.json ./packages/intelligence-engine/package.json
COPY --from=build /repo/packages/intelligence-engine/dist ./packages/intelligence-engine/dist
COPY --from=build /repo/packages/payments/package.json ./packages/payments/package.json
COPY --from=build /repo/packages/payments/dist ./packages/payments/dist
COPY --from=build /repo/packages/providers/package.json ./packages/providers/package.json
COPY --from=build /repo/packages/providers/dist ./packages/providers/dist
COPY --from=build /repo/packages/secrets/package.json ./packages/secrets/package.json
COPY --from=build /repo/packages/secrets/dist ./packages/secrets/dist
COPY --from=build /repo/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=build /repo/packages/shared-types/dist ./packages/shared-types/dist

COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Every COPY above defaults to root:root ownership — appuser needs to own the
# tree so `prisma migrate deploy` (docker-entrypoint.sh) can write its engine
# cache and the app can read every workspace's dist/. The database is remote
# Postgres now, so no local data file is created.
RUN chown -R appuser:appuser /repo

USER appuser
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["./docker-entrypoint.sh"]
