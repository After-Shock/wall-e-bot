# Auto-Delete "Run Now" Design

**Date:** 2026-03-09
**Status:** Approved

## Goal

Add "Run Now" buttons to the Auto-Delete dashboard page — one top-level button to run all enabled configs, and one per-config button to run individually. Uses Redis pub/sub to signal the bot for immediate execution.

## Architecture

Backend publishes a message to Redis channel `auto-delete:trigger`. Bot subscribes on startup and immediately executes the appropriate auto-delete logic. Fire-and-forget: API returns 204 instantly, bot runs asynchronously.

## API Endpoints

Both routes use existing `requireAuth` + `requireGuildAccess` middleware.

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/guilds/:guildId/auto-delete/run` | Publishes `{ guildId }` — runs all enabled configs |
| `POST` | `/api/guilds/:guildId/auto-delete/:id/run` | Publishes `{ guildId, configId }` — runs one specific config |

Both return `204 No Content` immediately.

## Bot Changes (`SchedulerService.ts`)

- On startup: create a dedicated Redis subscriber via `this.client.cache.redis.duplicate()`
- Subscribe to channel `auto-delete:trigger`
- On message:
  - If `configId` present → fetch that config from DB, call `runAutoDelete(config)`
  - If no `configId` → call `checkAutoDelete()` filtered to `guildId` only (enabled configs)
- Tear down subscriber in `destroy()` alongside existing intervals

## Frontend Changes (`AutoDeletePage.tsx`)

- **"Run Now" button** — top-right header area, next to "Add Channel". `Play` icon, secondary style. Disabled + spinner while pending. Shows inline "Running…" → "Done ✓" feedback.
- **Per-row run button** — small `Play` icon button on each config card, between toggle and delete. Same pending/done feedback scoped to that row.
- Both use `useMutation` calling their respective POST endpoints. No query invalidation needed.

## Out of Scope

- Progress reporting (how many messages deleted)
- Run history / audit log
- Running disabled configs manually
