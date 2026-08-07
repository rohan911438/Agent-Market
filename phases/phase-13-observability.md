# Phase 13 — Observability

## Context

This is the cross-cutting phase from the platform strategy's "OpenTelemetry tracing, SLOs backing a public Availability Score, a status page, synthetic monitoring, provider alerting" list. By the time this phase starts, several earlier phases (04, 05, 07, 09, 12) will have added new route surfaces — observability should wrap all of them, not just the original 8 first-party endpoints.

## Goal

Real distributed tracing across a request's lifecycle, a per-listing availability score backing the "Verified"/trust signals from Phase 08, a public status page, and best-effort synthetic monitoring — scoped honestly to what's actually achievable without an approved external observability backend.

## Scope

1. **OpenTelemetry instrumentation in `apps/api`.** A single trace ID should follow a request through: gateway/route entry → rate limiting → payment gate → handler → response (see `apps/api/src/server.ts`'s existing `onRequest` hook that already generates a `requestId` — trace context should incorporate or replace this, not run alongside it as a second, disconnected ID). **Check what's actually available before assuming an export destination** — if no OTel collector/Honeycomb/Datadog credential is configured or approved for this environment, wire up the OpenTelemetry SDK with a console or local-file exporter, structured so swapping in a real backend later is a config change (an env var), not a rewrite.
2. **Availability score.** A per-listing/per-endpoint uptime percentage over a rolling window (90 days is a reasonable default), computed from existing `ApiRequest` success/failure data (and, for third-party listings, from the synthetic checks in point 4 below, once those exist) — stored somewhere queryable (a computed field refreshed periodically, or computed on read if the query is cheap enough at current data volume) and exposed via `/v1/marketplace` so Phase 08's trust score and Phase 10's storefront badges can use a real number instead of a placeholder.
3. **Public status page.** A `/status` page in `apps/web` showing current health of first-party endpoints (reuse `/health`'s existing dependency checks — `apps/api/src/routes/health.route.ts` already checks database/cache/facilitator) plus an aggregate view of third-party listing availability. Match the existing site's design system, not a generic status-page template.
4. **Synthetic monitoring — scoped honestly.** A scheduled job periodically probing each published listing's `upstreamUrl`. For first-party endpoints this is meaningful today. For third-party listings, `upstreamUrl` may not even be a real, reachable endpoint yet (no gateway routes traffic there) — build the mechanism so it's ready and correct, but document plainly that its results for third-party listings are only as meaningful as the provider's own infrastructure, and note it's genuinely load-bearing for first-party endpoints today.
5. **Provider alerting — explicitly deferred.** This needs a real notification channel (email, webhook, Slack) that doesn't exist anywhere in the codebase today. Don't build a partial version of this (e.g., logging "would have alerted" somewhere nobody reads) — note it as clearly future work requiring its own scoping, not a half-feature bolted onto this phase.

## Key files / patterns to follow

- `apps/api/src/server.ts` for the existing request-lifecycle hooks (`onRequest`, and the `onSend`/`onResponse` hooks already used by `register-metered-route.ts`) — tracing spans should hook into the same lifecycle points, not a parallel one.
- `apps/api/src/routes/health.route.ts` for the existing dependency-check pattern the status page should build on rather than duplicate.
- New scheduled-job code (for the availability rollup and synthetic checks) should live somewhere clearly separated from request-handling code — check whether the repo already has any cron/scheduled-task convention before inventing one; if not, a simple `setInterval`-based internal scheduler is fine at this scale, don't reach for a job queue system that isn't otherwise needed.

## Decisions to make explicit before coding

- **Whether any real OTel backend is actually configured/approved.** Default to a local/console exporter if unsure — see point 1.
- **Availability score computation cadence** — computed on read (simple, always fresh, fine at current data volume) vs. a periodic rollup job (needed once data volume makes on-read computation slow). Pick on-read for v1 unless there's a concrete reason not to; don't build a rollup job pre-emptively for a scale problem that doesn't exist yet.

## Acceptance criteria

- A request through any first-party metered route produces a trace (visible in whatever exporter was configured) with distinguishable spans for at least the payment gate and the handler.
- `/status` renders correctly and reflects a simulated degradation — write a test or manual check that intentionally breaks a dependency (e.g., point the database check at an unreachable path) and confirms the status page reflects it.
- Availability score computes correctly from seeded `ApiRequest` fixtures with a known mix of successes and failures over the rolling window — assert the exact expected percentage, not just "some number came back."

## Not in scope

- Provider alerting/notifications (explicitly deferred — see point 5).
- Integrating a specific paid observability vendor — build against whatever's actually approved/available, defaulting to a local exporter otherwise.
- Guaranteeing synthetic checks against third-party `upstreamUrl`s are meaningful before the gateway exists.

## Depends on

Loosely on every phase that adds new routes (04, 05, 07, 09, 12) in the sense that tracing should cover them once they exist — but the instrumentation mechanism itself doesn't require any of them to be done first. Availability scoring feeds Phase 08's trust score and Phase 10's storefront badges, so do this before those two if sequencing tightly, though both already degrade gracefully without it.
