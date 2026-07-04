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

Optional Kroger credentials can be added to `apps/api/.env` as `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET`. `npm run dev` preserves existing `KROGER_*` and `TARGET_*` lines when it refreshes the database URL.
