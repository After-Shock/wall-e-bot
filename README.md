# Wall-E Bot 🤖

Wall-E is a TypeScript Discord server-management bot with an Express API and a React dashboard. It supports moderation, tickets, custom commands, reaction and automatic roles, leveling, welcome messages, scheduled messages, auto-delete, analytics, and manual configuration snapshots.

## Repository layout

- `bot/` — Discord gateway, commands, moderation, and schedulers
- `dashboard/backend/` — Express API, Discord OAuth, configuration, and migrations
- `dashboard/frontend/` — React/Vite dashboard served by nginx in production
- `shared/` — types shared by the three consumers
- `docker/` — development, production, and Saltbox Compose configurations

The runtime uses PostgreSQL for durable data and Redis for sessions, rate limits, cooldowns, and short-lived caches. See [ARCHITECTURE.md](ARCHITECTURE.md) for current boundaries and [docs/testing.md](docs/testing.md) for the authoritative development and verification workflow.

## Quick start

Prerequisites are Node.js 20.19.4 (the CI runtime), npm, Docker with Compose v2, and a Discord application.

```bash
cp .env.example .env
# Fill in the required Discord, database, Redis, session, and token-encryption values.
npm ci
npm run docker:dev
```

The development dashboard is available at `http://localhost:3002`; its API is at `http://localhost:3001`. The production Compose frontend is published on port 3000.

Run tests, builds, the configured bot-only lint check, and the production dependency audit using [docs/testing.md](docs/testing.md). Backend and frontend lint coverage has not been added yet.

## Production Compose deployment

Configure `.env`, then build the new images. Run the versioned migration runner from the new backend image **before** replacing the running services:

```bash
cd /opt/wall-e-bot
git pull
docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml run --rm --no-deps backend node dist/db/migrate.js
docker compose -f docker/docker-compose.yml up -d
```

The migration runner takes an advisory lock, applies each pending migration in its own transaction, records its version and checksum, and rejects edits to previously applied SQL. Migration history is forward-only: correct a deployed schema with a new migration rather than editing an old one. Running migrations before `up -d` avoids starting new code against the old schema.

The production Compose service keys are `postgres`, `redis`, `bot`, `backend`, and `frontend`; their containers are named `wall-e-postgres`, `wall-e-redis`, `wall-e-bot`, `wall-e-backend`, and `wall-e-frontend`.

All checked-in Compose deployments run exactly one bot process through the normal `start` command. Do not scale or shard it without an explicit scheduler-ownership design: scheduled polling and interval-based maintenance are not safe to duplicate across processes.

## Saltbox deployment

The Saltbox topology uses its external `saltbox` network and service names prefixed with `wall-e-`. Set `DOMAIN`, `WALL_E_DOMAIN`, and `DB_PASSWORD` in `.env`, ensure the Saltbox network exists, and use the same migrate-before-replacement sequence:

```bash
cd /opt/wall-e-bot
git pull
docker compose -f docker/docker-compose.saltbox.yml build
docker compose -f docker/docker-compose.saltbox.yml run --rm --no-deps wall-e-backend node dist/db/migrate.js
docker compose -f docker/docker-compose.saltbox.yml up -d
```

The Saltbox backend service and container are both `wall-e-backend`; the bot is `wall-e-bot`. The dashboard defaults to `https://wall-e.${DOMAIN}` unless `WALL_E_DOMAIN` overrides it.

Useful non-destructive commands:

```bash
docker compose -f docker/docker-compose.yml logs -f
docker compose -f docker/docker-compose.saltbox.yml logs -f wall-e-backend
docker exec -it wall-e-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Manual configuration snapshots cover the guild JSON configuration only. They are not backups of PostgreSQL, Discord roles/channels/members/messages, custom-command rows, or schedules; maintain separate database and host backups.

## License

MIT License — see [LICENSE](LICENSE).
