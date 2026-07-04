# Agent Workflow

Cartwise — US grocery price-comparison mobile app (Expo + React Native) with a Fastify "Cartwise Price API" backend. Product docs live in DocVault at `/Users/rachit/DocVault/docs/cartwise/`. This repo uses `staging` as the integration branch for all product work. Always prioritize creating PRs instead of direct commits.

Read `workflows/lessons.md` at the start of every session. Append to it whenever a mistake costs time.

## Model Split

- **Claude Fable (main session):** planning, architecture, DB schema, algorithm/spec design (optimizer, matcher), PR review.
- **Codex plugin:** token-intensive implementation work (screens, endpoints, collectors, tests) in its own worktrees on `codex/` branches.
- Fable writes a spec before handing a slice to Codex; Fable reviews every Codex PR before merge.

## Branch Rules

- `main` is protected by convention and only receives changes after `staging` has been reviewed and tested.
- `staging` is the shared preview branch. Feature branches and Codex worktrees branch from `staging`.
- Do not merge feature work directly into `main`.
- Merge feature branches into `staging` first, verify there, then promote `staging` to `main` only after approval.
- Use the branch prefix `codex/` for Codex-created feature branches unless the user requests another name.
- Create a new branch for each new feature/task.
- Remotes are SSH (`git@github.com:rachitt/cartwise.git`). Commit messages: short and simple, no Co-Authored-By.

## Worktree Rules

- Parallel worktrees are encouraged for independent slices: mobile screens, price API, collectors, shared types.
- Each worktree owns a clearly scoped area. Avoid overlapping edits when multiple agents work in parallel.
- Never revert another agent's or the user's changes. If a conflict appears, inspect it and merge intentionally.

## Repo Layout

- `apps/mobile` — Expo app (TypeScript, Expo Router, TanStack Query, Zustand).
- `apps/api` — Fastify + Drizzle + Postgres Cartwise Price API and collectors.
- `packages/shared` — types shared between mobile and api.

## Quality Gate

Before merging into `staging`, run in every touched workspace:

```bash
npm run typecheck && npm run lint && npm test
```

For mobile UI changes, also run the app in Expo Go / simulator and verify:

- No red screens or console errors.
- Navigation works across onboarding, search, cart, and alerts.
- Price rows always show an "as of" freshness stamp.

For API changes, smoke-test the touched endpoints with curl against a real ZIP (e.g. 45202).

## Backend Rules

- Validate all inputs with zod. Rate-limit public endpoints.
- Never expose collector credentials; secrets live in `.env` (gitignored), documented in `.env.example`.
- Price data is fetched on demand and cached with per-source TTLs — never bulk-crawl retailers.
- Every price response includes `capturedAt`. Stale beats wrong: if a collector fails, serve cache and flag freshness, never fabricate.

## Promotion To Main

Only promote `staging` into `main` after:

- The staging build passes the quality gate.
- The app has been exercised in the simulator (mobile) or via curl (api).
- The user has approved the staged product state.
