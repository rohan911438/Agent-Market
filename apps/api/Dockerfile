# syntax=docker/dockerfile:1
FROM node:22-slim AS base
WORKDIR /repo
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# ---- deps: production-only install (no devDependencies, no build tooling) ----
FROM base AS deps
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
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
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma

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

USER appuser
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
