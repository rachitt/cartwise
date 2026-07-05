# Cartwise

Cartwise is a grocery price-comparison monorepo with an Expo mobile app and a Fastify/Postgres price API.

## Quickstart

Install dependencies once:

```bash
npm install
```

Start the full development stack:

```bash
npm run dev
```

This command looks for a usable Postgres, creates the `cartwise` database when needed, writes `apps/api/.env`, runs API migrations and seed data, then starts the API and Expo together.

For UI-only work with no backend, Docker, or database:

```bash
npm run dev:mock
```

Optional live collector credentials can be added to `apps/api/.env`. Kroger uses
`KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET`; Walmart uses `WALMART_CONSUMER_ID`,
`WALMART_PRIVATE_KEY`, `WALMART_KEY_VERSION`, and optional `WALMART_PUBLISHER_ID`. Target uses
public Target web APIs by default and can be overridden with `TARGET_API_KEY`. ALDI uses
its public storefront guest session and does not require credentials. `npm run dev`
preserves existing `KROGER_*`, `TARGET_*`, `WALMART_*`, and `ALDI_*` lines when it refreshes the
database URL.

To test real collector access without the mobile app:

```bash
npm run smoke:live --workspace apps/api
```

By default this checks Kroger, Target, and ALDI. To include parked collectors such as Walmart:

```bash
SMOKE_CHAINS=kroger,target,aldi,walmart npm run smoke:live --workspace apps/api
```
