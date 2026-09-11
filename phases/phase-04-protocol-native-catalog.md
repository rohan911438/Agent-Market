# Phase 04 — Protocol-Native Catalog (OpenAPI + MCP)

## Context

You're working on AgentMarket, an x402-native marketplace for AI-agent-callable APIs (Node/Fastify API in `apps/api`, Next.js frontend in `apps/web`, shared packages under `packages/`). Phase 01 built a control-plane API letting third-party providers register, publish, and price listings (`packages/database`'s `ProviderAccount`/`ApiListing` models, routes in `apps/api/src/routes/control-plane/`). `CreateListingRequestSchema` (`packages/shared-types/src/control-plane.ts`) already has an optional `openApiSpec: string` field, but nothing parses, validates, or does anything with it yet.

The platform strategy calls for every listing — first-party and third-party — to be protocol-native: upload a spec once, get Swagger UI, a Postman collection, and MCP tool discoverability for free, without the provider (or us, for first-party endpoints) maintaining each artifact by hand.

## Goal

Turn the currently-inert `openApiSpec` field into a real pipeline: validate it at upload time, serve Swagger UI and a Postman collection generated from it, and expose every published listing as an MCP tool so Claude, Cursor, Windsurf, and VS Code can discover the catalog without custom integration work per provider.

## Scope

1. **OpenAPI validation at listing time.** When `openApiSpec` is provided on `POST /v1/listings`, parse and validate it (OpenAPI 3.x). Reject with `VALIDATION_ERROR` (a 400, matching the existing error-handler pattern in `apps/api/src/plugins/error-handler.ts`) if it doesn't parse or is missing required fields (paths, at least one operation). Store the canonical parsed JSON (not raw text) so downstream generation doesn't re-parse on every request.
2. **First-party specs, generated, not hand-written.** The 8 existing first-party endpoints (`apps/api/src/routes/*.route.ts`) already have Zod schemas in `packages/shared-types/src/`. Generate an OpenAPI document for each from those schemas (a library like `zod-to-openapi` fits the existing Zod-everywhere convention better than hand-authoring 8 YAML files that will drift). This makes the *entire* catalog protocol-native, not just third-party listings — that symmetry matters for the "one gateway, one discovery surface" principle already established in `marketplace.route.ts`.
3. **Swagger UI.** `GET /v1/listings/:slug/docs` (third-party) and equivalent for first-party endpoints, rendering Swagger UI against the stored/generated spec. Check whether `swagger-ui-dist` (static assets, no build step) or a small React-rendered page in `apps/web` fits better given the existing stack — lean toward serving it from `apps/api` alongside the spec itself, since Swagger UI is documentation for an API, not a marketplace UI page.
4. **Postman collection.** `GET /v1/listings/:slug/postman.json` — convert the OpenAPI spec to a Postman Collection v2.1 JSON (a library like `openapi-to-postmanv2` exists; check its Node/ESM compatibility against this repo's `"type": "module"` setup before committing to it — if it's CJS-only and awkward to import, a hand-rolled minimal converter covering paths/methods/params is preferable to fighting module interop for a non-critical feature).
5. **MCP tool manifest.** Expose `/.well-known/mcp.json` (or `/v1/mcp/tools`) listing every *published* listing as an MCP tool definition: name, description, input schema (derived from the OpenAPI spec's parameters), and enough metadata (price, resource path) that a calling agent knows it's metered. Use `@modelcontextprotocol/sdk` for the manifest shape rather than hand-rolling the MCP JSON structure from scratch.

## Key files / patterns to follow

- New route file(s) under `apps/api/src/routes/` (or a new `apps/api/src/routes/catalog/` directory, mirroring the `control-plane/` precedent from Phase 01) — register via `apps/api/src/routes/index.ts`, same as every other route module.
- Schema changes go in `packages/database/prisma/schema.prisma` (a new nullable `parsedOpenApiSpec: String?` column on `ApiListing`, or a new table if you decide first-party specs need persistence too — first-party specs can likely be generated on boot/on-demand and cached in memory instead, since they're derived from code, not user input).
- Follow Phase 01's migration discipline: generate against a throwaway database, apply via `prisma migrate deploy`, never `db push` against the real `dev.db`.
- New Zod schemas belong in `packages/shared-types/src/`, not inline in route files.

## Decisions to make explicit before coding

- **Which OpenAPI validation library** — check what's already a transitive dependency before adding a new one (Fastify itself has JSON-schema tooling that might partially overlap).
- **Where Swagger UI actually renders** — served as static HTML from `apps/api`, or a page in `apps/web`. Pick one and be consistent for both first- and third-party listings.
- **MCP transport** — an HTTP-based manifest is enough for tool *discovery*; decide explicitly whether this phase also stands up a real MCP server (stdio/SSE transport) that a client can *connect* to, or whether that's a fast-follow once discovery alone is proven useful. Don't build both halfway.

## Acceptance criteria

- A listing published with a valid OpenAPI spec: `GET /v1/listings/:slug/openapi.json` returns the parsed spec; `/docs` renders Swagger UI against it; `/postman.json` downloads and imports cleanly into Postman.
- A listing published *without* a spec doesn't break the catalog — degrade gracefully (no docs/postman links, or a clear "not provided" state), don't make `openApiSpec` retroactively required.
- The MCP manifest lists every published listing (first- and third-party) with correct name, price, and input schema; validate it against `@modelcontextprotocol/sdk`'s own types, not just "it's valid JSON."
- At least one real MCP-speaking client (Claude Desktop, Cursor, or the MCP Inspector CLI) can load the manifest and see the tools listed correctly.

## Not in scope

- Actually proxying a *call* through to a third-party listing's `upstreamUrl` — that's gateway infrastructure, not built yet (see Phase 12's notes on why orchestration is scoped to first-party endpoints for now).
- A no-code OpenAPI spec builder for providers who don't already have one.
- A2A support (Phase 05) — related, but a distinct protocol with its own task lifecycle; don't conflate the two.

## Depends on

Nothing from phases 05–13. This phase's spec-generation pipeline is a dependency *for* Phase 05.
