# Wall-E architecture

Wall-E is a TypeScript monorepo with three runtime applications and one shared package. The Discord bot and dashboard API have separate lifecycles but share PostgreSQL domain data, Redis infrastructure, and `@wall-e/shared` contracts.

## Runtime services

| Production service | Container | Responsibility |
|---|---|---|
| `bot` | `wall-e-bot` | Discord gateway, commands, moderation, scheduled work |
| `backend` | `wall-e-backend` | Express API, Discord OAuth, guild configuration, status routes |
| `frontend` | `wall-e-frontend` | React/Vite static assets served by nginx |
| `postgres` | `wall-e-postgres` | Durable application data and JSONB guild configuration |
| `redis` | `wall-e-redis` | Sessions, rate limits, queues, cooldowns, and caches |

The Saltbox Compose file keeps the same containers but uses prefixed service keys (`wall-e-backend`, for example) on the external `saltbox` network. The standard production file uses `wall-e-network` plus the external `pangolin` network for the frontend. These are intentionally separate deployment topologies.

## Request and authentication flow

The browser reaches nginx, which serves the SPA and proxies `/api` and `/auth` traffic to the backend. Passport exchanges the Discord OAuth authorization code, and the backend stores access and refresh tokens encrypted at rest in PostgreSQL with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`. Decrypted access and refresh tokens are also retained in the Redis-backed Passport session while that session is active. The browser receives only an HTTP-only session cookie, and guild routes apply guild-access authorization.

The standard nginx configuration proxies to `backend:3001`, matching the standard production service key. Saltbox names that service `wall-e-backend`; its frontend image currently uses the same nginx configuration, so `/api` and `/auth` proxy resolution is a known Saltbox routing mismatch until the configuration is made topology-aware. Do not treat the Saltbox dashboard routing as verified in its current form.

The bot connects outbound to Discord, reads and writes durable state in PostgreSQL, and uses Redis for transient coordination. Manual dashboard snapshots contain guild JSON configuration only; they do not replace PostgreSQL or Discord backups.

## Schema changes

`dashboard/backend/src/db/migrate.ts` discovers ordered SQL and data migrations. A PostgreSQL advisory lock serializes runners; each pending step and its bookkeeping insert run in one transaction. Applied SQL checksums are verified. Migrations are forward-only, so deployed files remain immutable and corrections use a new migration.

Deployments build the new backend image, run its migration command against the still-running database, and only then replace services. See [README.md](README.md#production-compose-deployment).

## Scheduling and process topology

The normal bot start path runs a single process. `start:shard` is an optional explicit entry point; it does not activate automatically. Sharding or multiple bot replicas are not currently an operationally transparent option because interval-based ticket, auto-delete, and presence work would run once per process, and queue workers do not route all work by shard ownership.

Scheduled-message claims and failure metadata are durable, but delivery is not exactly once. A process failure after claiming an occurrence and before Discord accepts it can lose that occurrence. Preserve a single bot process unless scheduler ownership and delivery semantics are deliberately redesigned.

## Operational boundaries

- `/health` is liveness; `/health/ready` checks PostgreSQL and Redis readiness.
- Scheduler/status heartbeats show that work ran recently, not that every Discord delivery succeeded.
- Production Compose enables Redis AOF, container memory limits, and bounded JSON log rotation.
- Redis loss can invalidate sessions and transient controls; durable guild and moderation state remains in PostgreSQL.

Historical decisions remain in [docs/adrs](docs/adrs/). Current open risks are summarized in [TECH_DEBT.md](TECH_DEBT.md) and [FAILURE_MODES.md](FAILURE_MODES.md).
