# Phase 05 — A2A (Agent-to-Agent) Protocol Support

## Context

AgentMarket (Node/Fastify API in `apps/api`, Next.js frontend in `apps/web`) currently exposes every metered endpoint as a plain HTTP resource gated by x402 (`apps/api/src/middleware/x402-payment.ts`, `apps/api/src/routes/register-metered-route.ts`). Phase 04 (assumed done before this one starts) generates an OpenAPI spec and MCP manifest per listing. Google's Agent-to-Agent (A2A) protocol is a different discovery/invocation surface aimed specifically at autonomous agents calling other agents' *tasks*, not IDE tools calling *functions* — the audience and lifecycle are different enough from MCP that this is its own phase, not an extension of Phase 04.

## Goal

Make every first-party endpoint callable as an A2A task by another autonomous agent, with an A2A agent card advertising the capability, while keeping payment enforcement exactly as strict as the existing HTTP path.

## Scope

1. **Agent card generation.** `/.well-known/agent.json` (the A2A-standard discovery path) describing AgentMarket's first-party capabilities — reuse Phase 04's generated OpenAPI metadata as the source of truth for names/descriptions/schemas rather than re-describing each endpoint by hand a second time.
2. **A2A task server for first-party endpoints.** Implement the core A2A task lifecycle — `tasks/send` (create), `tasks/get` (poll status/result), `tasks/cancel` — as a new route surface wrapping the *existing* metered route handlers rather than duplicating their business logic. Look at how `registerMeteredRoute` (`apps/api/src/routes/register-metered-route.ts`) already separates the payment gate from the handler; the A2A wrapper should reuse the same handler functions, not reimplement risk-analysis/sentiment/etc. a second time.
3. **Payment inside the task lifecycle.** Decide explicitly (see below) whether payment happens at `tasks/send` time (task creation itself returns 402 if unpaid, same shape as the HTTP path) or is a precondition checked before task creation. Whichever you choose, it must be exactly as strict as today's HTTP gate — an A2A task must never be a way to get a free call.
4. **Per-listing agent cards for third-party listings** — advertise them for discoverability even though actually *calling* one still depends on the not-yet-built gateway (same caveat as Phase 04's MCP manifest for third-party listings).

## Key files / patterns to follow

- New route module(s) under `apps/api/src/routes/`, registered via `apps/api/src/routes/index.ts` alongside everything else — don't build a parallel server process for this.
- Reuse `ctx.paymentService` (`apps/api/src/context.ts`) for payment requirement/verification/settlement exactly as `x402-payment.ts` does — don't hand-roll a second payment path that could drift from the HTTP one's security properties.
- Whatever A2A library/SDK you use for the task JSON shapes, verify it doesn't assume a request/response model incompatible with Fastify's lifecycle before committing — check this early, not after wiring half the routes.

## Decisions to make explicit before coding

- **Payment timing in the task lifecycle.** A2A tasks are often async (create now, poll for a result later) — figure out whether that maps to "pay at creation, execute synchronously, first `tasks/get` just returns the already-known result" (simplest, matches how the HTTP path already works) or a genuinely async execution model. Don't build real async task execution (queues, workers) unless the task's own nature requires it — most of AgentMarket's current endpoints resolve in milliseconds.
- **Which A2A library, if any.** If nothing well-maintained exists for Node/TypeScript yet, implementing the (documented, JSON-RPC-shaped) task lifecycle directly against the spec is reasonable — don't force-fit a library that fights the rest of the stack.

## Acceptance criteria

- An A2A-compliant client can fetch the agent card, create a task against a first-party endpoint (e.g. sentiment), and receive a completed result matching what the equivalent HTTP call would return.
- Creating a task without payment is rejected the same way an unpaid HTTP call is (402-equivalent in A2A's error shape) — write a test asserting this explicitly, since "payment enforcement stayed strict" is the one thing that must never regress here.
- Third-party listings appear in the agent-card catalog (discoverable) even though they can't yet be invoked end-to-end.

## Not in scope

- Actually routing an A2A task through to a third-party listing's `upstreamUrl` (same gateway dependency noted in Phase 04).
- Multi-agent negotiation, task delegation chains, or anything beyond the basic create/poll/cancel lifecycle.

## Depends on

Phase 04 (reuses its generated spec/metadata as the source of truth for agent cards — don't build a second, parallel description of each endpoint).
