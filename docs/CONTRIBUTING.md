# Contributing

## Workflow

1. Branch from `main`.
2. Make changes; keep commits scoped and the message focused on *why*.
3. `npm run lint && npm run typecheck && npm test` before opening a PR — CI runs the
   same three gates.
4. Open a PR describing what changed and why; link any relevant doc updates.

## Conventions

- TypeScript strict mode everywhere; no `any` without a `// eslint-disable` comment
  explaining why.
- Prefer editing an existing package/route pattern over introducing a new one — see
  [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for where new endpoints/providers go.
- No secrets in commits, ever. `.env` is git-ignored; only commit `.env.example` with
  placeholder values.
- Prettier + ESLint (flat config, `eslint.config.mjs` at the repo root) are the source
  of truth for formatting — run `npm run format` rather than hand-formatting.
- Every new pipeline stage, provider adapter, or payment provider should ship with a
  unit test in the same package; every new route should ship with an integration test
  in `apps/api/test/`.

## Commit messages

Imperative mood, one logical change per commit where practical
(`add risk-analysis route`, not `misc fixes`).
