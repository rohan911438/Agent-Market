# AgentMarket — Phase Folder

This folder tracks Phase 2 ("Platform Strategy") execution: one file per phase, each written as a **self-contained implementation prompt** — context, scope, explicit files/patterns to follow, acceptance criteria, and what's deliberately out of scope. Derived from the platform strategy artifact (`AgentMarket — Phase 2 Platform Strategy`, published as a Claude Artifact) and the "first moves" it closed with.

## How to use these

Each `phase-NN-*.md` file (for phases not yet done) is written to be handed directly to a Claude Code session as the task prompt — either pasted in or referenced (`@phases/phase-04-protocol-native-catalog.md`). It assumes no prior context beyond what's in the repo; it doesn't assume the reader has seen the strategy artifact or this conversation.

Work through them roughly in order — later phases assume earlier ones exist (e.g., Analytics reads data the Revenue Platform's schema produces; Orchestration composes listings the Marketplace phase organizes). Sequencing isn't rigid where a dependency doesn't actually exist — use judgment.

## Status

| Phase | Title | Status | Notes |
|---|---|---|---|
| 01 | Control-Plane API | ✅ Done | `apps/api/src/routes/control-plane/`, `packages/database` (`ProviderAccount`, `ApiListing`) |
| 02 | Provider Dashboard UI | ✅ Done | `apps/web/src/app/provider/` |
| 03 | Agent SDK (TypeScript) | ✅ Done | `packages/agent-sdk` |
| 04 | Protocol-Native Catalog (OpenAPI + MCP) | ✅ Done | `apps/api/src/routes/catalog/`, `apps/api/src/services/{openapi-spec,mcp-catalog,first-party-openapi}.ts` |
| 05 | A2A Protocol Support | ✅ Done | `apps/api/src/routes/a2a/` (agent card + task lifecycle) |
| 06 | Python Agent SDK | ✅ Done | `packages/agent-sdk-python` |
| 07 | Revenue Platform | ✅ Done | `apps/api/src/services/revenue.ts` |
| 08 | Trust & Verification Ladder | ✅ Done | `apps/api/src/services/trust-score.ts` |
| 09 | Analytics | ✅ Done | `apps/api/src/services/analytics.ts` |
| 10 | Marketplace Storefront | ✅ Done | `apps/web/src/app/marketplace/` |
| 11 | AI Discovery | ✅ Done | `apps/api/src/routes/discover.route.ts`, `services/discovery-ranking.ts` |
| 12 | Orchestration Engine | ✅ Done | `apps/api/src/routes/workflows.route.ts`, `services/workflow-executor.ts` |
| 13 | Observability | ✅ Done | `apps/api/src/observability/`, `services/availability.ts`, `apps/web/src/app/status/` |
| 14 | MCP Agent-Native Interface | ✅ Done | `apps/api/src/routes/catalog/mcp.route.ts`, `services/mcp-tool-executor.ts`, `services/listing-invocation.ts`, `routes/listing-invoke.route.ts` |

All 14 phases are done. The per-phase files are kept in this folder as a record of what shipped and why, not as prompts to re-run.

## Ground rules that apply to every phase (don't repeat per-file)

- **Reuse existing patterns, don't invent parallel ones.** `registerXRoute(server, ctx)` for routes, one repository class per Prisma model under `packages/database/src/repositories/`, Zod schemas in `packages/shared-types/src/`, `AppError` for typed failures. Read a neighboring file before adding a new one in the same directory.
- **Migrations, not `db push`, for schema changes.** Generate against a throwaway database (a fresh file, never the real `dev.db`), then apply to the real one with `prisma migrate deploy` (baselining with `migrate resolve --applied` first if it was never tracked via `migrate dev`). See the git history for phase 01 for the exact sequence.
- **Test against a real server, not just mocks, before calling something done.** The control-plane and Agent SDK phases both caught real bugs this way (a Content-Type header bug in the web client, an error-wrapping bug in the SDK) that unit tests alone missed.
- **Say what you're deliberately not building.** Every phase below has a "Not in scope" section — respect it. Half-building the next phase while implementing this one is worse than leaving a clean seam.
- **Design quality bar**: if a phase touches `apps/web`, match the existing design system (`apps/web/src/app/globals.css` tokens, `apps/web/src/components/ui/*`) — don't invent a new visual language for one page.
