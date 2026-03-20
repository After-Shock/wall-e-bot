# Dependency Strategy

## Goal

Keep local Docker and VPS production deployments on the same dependency and image baseline, while allowing controlled exceptions for known transitive issues that require staged upgrades.

## Baseline

- Node runtime baseline: `20.19.4`
- Install mode in CI and Docker builds: `npm ci`
- Lockfile: single root `package-lock.json`
- Production audit gate: `npm run audit:prod`

## Dependency Policy

### Immediate patch lane

Use for direct production dependencies with security fixes that do not require architectural changes:

- `axios`
- `express`
- `helmet`
- `pg`
- `ioredis`

Process:

1. Update the package version in the affected workspace.
2. Regenerate the root lockfile.
3. Run targeted tests and workspace builds.
4. Rebuild Docker images.
5. Promote the exact image digest from staging to production.

### Staged upgrade lane

Use for platform dependencies where fixes may change runtime behavior:

- `discord.js`
- `passport`
- Discord gateway/websocket stack

Process:

1. Create a dependency branch dedicated to the upgrade.
2. Upgrade the dependency and any required peers/transitives.
3. Test the bot against a staging Discord server.
4. Verify slash commands, gateway connection, reactions, scheduled jobs, dashboard auth, and Redis/Postgres connectivity.
5. Promote only after the staging image is stable.

## Audit Policy

`npm run audit:prod` enforces these rules:

- Block direct production vulnerabilities with severity `high` or `critical`.
- Block any non-allowlisted production vulnerability with severity `moderate` or above.
- Allowlisted transitive vulnerabilities must have a documented reason and an upgrade plan.

Current allowlisted transitive set:

- `discord.js`
- `@discordjs/rest`
- `@discordjs/ws`
- `undici`
- `qs`

These are tracked until the Discord stack upgrade is complete.

## Docker Release Flow

### Local Docker

1. `docker compose -f docker/docker-compose.dev.yml build`
2. `docker compose -f docker/docker-compose.dev.yml up`
3. Smoke test:
   - bot logs in
   - dashboard login works
   - backend reaches Postgres and Redis
   - a basic slash command works in a staging Discord server

### VPS Production

1. Build images from the same git commit and lockfile used in staging.
2. Push/tag immutable image references.
3. Pull and deploy those exact image digests on the VPS.
4. Run post-deploy checks:
   - backend health endpoint
   - Discord bot connected
   - dashboard auth callback works
   - Redis/Postgres healthy

## Recommended Promotion Model

- `main`: normal development
- `security/*`: dependency-only changes
- `staging`: candidate images validated before VPS rollout

Do not promote dependency upgrades straight from an untested local build to the VPS.
