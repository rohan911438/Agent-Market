# syntax=docker/dockerfile:1
FROM node:22-slim AS base
WORKDIR /repo
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm install

FROM deps AS build
RUN npm run db:generate
RUN npx turbo run build --filter=@agentmarket/api...

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo ./
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
