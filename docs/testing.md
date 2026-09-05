# Testing and local development

This is the authoritative verification route for the repository. Run commands from the repository root on Node.js 20.19.4, which matches CI.

## Automated verification

Install the locked dependency tree, then run the retained suites and builds:

```bash
npm ci
DATABASE_URL=postgresql://test:test@127.0.0.1:1/test \
REDIS_URL=redis://127.0.0.1:1 \
DISCORD_TOKEN=test-token-for-ci \
DISCORD_CLIENT_ID=123456789012345678 \
NODE_ENV=test \
npm test
npm run build
npm run lint --workspaces --if-present
npm run audit:prod
```

`npm run build` compiles `shared` once before the bot, backend, and frontend consumers. The current automated suites are unit and migration-discovery tests and do not require live PostgreSQL, Redis, or Discord connections. They are not database integration coverage.

The configured workspace lint command currently exercises only `bot`, because the backend and frontend do not define lint scripts. Expanding lint coverage is separate work; do not interpret a passing lint job as repository-wide lint coverage.

The production audit is a visible CI policy check. Treat a failure as an outstanding dependency finding; do not disable or weaken the policy to make CI green.

## Local Compose environment

Copy `.env.example` to `.env` and supply the required Discord credentials, `SESSION_SECRET`, and the 64-character hexadecimal `TOKEN_ENCRYPTION_KEY`. Then start the development stack:

```bash
npm run docker:dev
# Equivalent explicit command:
docker compose -f docker/docker-compose.dev.yml up --build
```

Development endpoints:

| Service | Endpoint |
|---|---|
| Frontend dashboard | `http://localhost:3002` |
| Backend API | `http://localhost:3001` |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

Run migrations through the maintained workspace runner:

```bash
npm run db:migrate
```

The runner discovers ordered SQL and data migrations, locks concurrent runners, wraps each pending migration in a transaction, and verifies stored checksums. Never edit an applied migration; add a new forward migration.

Register slash commands only against an intentional Discord application:

```bash
npm run deploy-commands -w bot
```

## Manual smoke checks

Automated tests do not replace Discord/OAuth checks. For a release candidate, use a non-production guild and verify:

1. Discord OAuth login and logout, including an expired-session redirect.
2. A retained settings update appears in the bot without overwriting unrelated settings.
3. One moderation action, ticket open/close, and custom command execution.
4. A scheduled message and auto-delete rule through one bot process.
5. Manual configuration snapshot create, restore, and delete, remembering that this is not a database backup.
6. `/health` for liveness and `/health/ready` for PostgreSQL/Redis readiness.

Do not use live-guild actions or deploy commands as part of ordinary unit verification.

## Container and Compose checks

Build the frontend production image, including its TypeScript pass, and render every Compose variant before deployment:

```bash
docker build -f docker/Dockerfile.frontend -t wall-e-frontend:test .
docker compose --env-file .env -f docker/docker-compose.dev.yml config --quiet
docker compose --env-file .env -f docker/docker-compose.yml config --quiet
docker compose --env-file .env -f docker/docker-compose.saltbox.yml config --quiet
```

These commands validate configuration and images only. Deployment steps and the required migrate-before-replacement order live in [README.md](../README.md#production-compose-deployment).
