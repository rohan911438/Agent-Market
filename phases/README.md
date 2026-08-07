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
| 04 | Protocol-Native Catalog (OpenAPI + MCP) | 🔲 Not started | |
| 05 | A2A Protocol Support | 🔲 Not started | Depends on 04 (same spec-generation pipeline) |
| 06 | Python Agent SDK | 🔲 Not started | Ports `packages/agent-sdk`'s design, not its code |
| 07 | Revenue Platform | 🔲 Not started | |
| 08 | Trust & Verification Ladder | 🔲 Not started | Extends the control plane from phase 01 |
| 09 | Analytics | 🔲 Not started | Depends on 07's event/usage plumbing where it overlaps |
| 10 | Marketplace Storefront | 🔲 Not started | Depends on 08 (badges) and 04 (compatibility icons) |
| 11 | AI Discovery | 🔲 Not started | Depends on 09 (needs usage data to rank on) |
| 12 | Orchestration Engine | 🔲 Not started | Depends on 01 (listings) and payments already in place |
| 13 | Observability | 🔲 Not started | Cross-cutting — touches every route added by later phases |

Phases 1–3 are marked done and kept in this folder as a record of what shipped and why, not as prompts to re-run.

## Ground rules that apply to every phase (don't repeat per-file)

- **Reuse existing patterns, don't invent parallel ones.** `registerXRoute(server, ctx)` for routes, one repository class per Prisma model under `packages/database/src/repositories/`, Zod schemas in `packages/shared-types/src/`, `AppError` for typed failures. Read a neighboring file before adding a new one in the same directory.
- **Migrations, not `db push`, for schema changes.** Generate against a throwaway database (a fresh file, never the real `dev.db`), then apply to the real one with `prisma migrate deploy` (baselining with `migrate resolve --applied` first if it was never tracked via `migrate dev`). See the git history for phase 01 for the exact sequence.
- **Test against a real server, not just mocks, before calling something done.** The control-plane and Agent SDK phases both caught real bugs this way (a Content-Type header bug in the web client, an error-wrapping bug in the SDK) that unit tests alone missed.
- **Say what you're deliberately not building.** Every phase below has a "Not in scope" section — respect it. Half-building the next phase while implementing this one is worse than leaving a clean seam.
- **Design quality bar**: if a phase touches `apps/web`, match the existing design system (`apps/web/src/app/globals.css` tokens, `apps/web/src/components/ui/*`) — don't invent a new visual language for one page.
