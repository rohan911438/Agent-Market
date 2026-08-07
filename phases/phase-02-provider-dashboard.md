# Phase 02 — Provider Dashboard UI ✅ Done

## What shipped

A UI on top of Phase 01's control-plane API, built against the site's existing design system rather than a new one:

- `/provider` — auth gate (register / sign-in-with-API-key tabs), one-time API key reveal, account status + listings table with an empty state
- `/provider/listings/new` — create-listing form
- `/provider/listings/[id]` — overview, pricing form, payment form, and a **live publish checklist** that mirrors the server's requirements gate in real time (client-side preview computed from known state; the authoritative result always comes from the server response)
- Nav updated with a "Publish" link

## Where it lives

- Pages: `apps/web/src/app/provider/`
- Session/auth: `apps/web/src/lib/provider-context.tsx` (localStorage-held API key, same pattern as `wallet-context.tsx`)
- API client: `apps/web/src/lib/provider-api.ts`
- New shared UI primitive: `apps/web/src/components/ui/textarea.tsx` (didn't exist before; `Input` also gained a `hint` prop while building this)

## Decisions worth knowing before extending this

- **`callApi` (`apps/web/src/lib/api-client.ts`) only sets `Content-Type: application/json` when a body is actually present.** This was a real bug fixed during this phase — Fastify rejects a truly-empty body when the header claims JSON, which broke every bodyless POST (`verify`, `rotate-key`, `publish`). If you add a new bodyless action anywhere in the web app, this is already handled — don't reintroduce the bug in a new client helper.
- **The publish checklist is deliberately dumb on the client** (a hardcoded mirror of the same 5 checks the server runs) rather than fetched from a "preview" endpoint. If Phase 08 (Trust) or Phase 01 extensions add new publish requirements, update both `apps/api/src/services/listing-publish-gate.ts` and the `computeChecklist` function in `apps/web/src/app/provider/listings/[id]/page.tsx` — they will drift if only one is touched.
- **No route protection beyond client-side checks** — visiting `/provider/listings/[id]` without a session just shows a "sign in first" prompt, it doesn't redirect. That's intentional for a first pass; revisit only if it's actually causing confusion, not preemptively.
