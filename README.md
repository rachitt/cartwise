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

When Docker Compose is used, `npm run dev` creates an untracked `docker-compose.override.yml` from
`docker-compose.override.example.yml` if needed. The override maps host port `5433` to the Postgres
container's `5432`, matching the dev script's first local probe.

Expo is started with `EXPO_PUBLIC_API_URL` pointed at the dev machine's LAN IP on port `3000` so a
physical phone can reach the API. Set `EXPO_PUBLIC_API_URL` before running `npm run dev` to override
that value.

For UI-only work with no backend, Docker, or database:

```bash
npm run dev:mock
```

Optional live collector credentials can be added to `apps/api/.env`. Kroger uses
`KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET`; Walmart uses `WALMART_CONSUMER_ID`,
`WALMART_PRIVATE_KEY`, `WALMART_KEY_VERSION`, and optional `WALMART_PUBLISHER_ID`. Target uses
public Target web APIs by default and can be overridden with `TARGET_API_KEY`. ALDI uses
its public storefront guest session and does not require credentials. `npm run dev`
preserves existing `apps/api/.env` settings when it refreshes the database URL.

To test real collector access without the mobile app:

```bash
npm run smoke:live --workspace apps/api
```

By default this checks Kroger, Target, and ALDI. To include parked collectors such as Walmart:

```bash
SMOKE_CHAINS=kroger,target,aldi,walmart npm run smoke:live --workspace apps/api
```
