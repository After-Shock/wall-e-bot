# Auto-Delete Run Now Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add "Run Now" buttons to the Auto-Delete dashboard page — a top-level "Run All" (enabled only) and a per-config "Run" button — using Redis pub/sub to trigger immediate execution in the bot.

**Architecture:** Backend publishes to Redis channel `auto-delete:trigger`. Bot subscribes on startup and calls the appropriate `runAutoDelete` logic immediately. API returns 204 instantly (fire-and-forget). Three layers: backend routes → Redis → bot SchedulerService.

**Tech Stack:** ioredis, Express, TypeScript, React, TanStack Query, lucide-react

---

### Task 1: Extract shared Redis client in backend

**Context:** Currently `dashboard/backend/src/index.ts` creates `const redis = new Redis(...)` locally, used only for the session store. The new run-now routes need to publish to Redis, but they live in `autoDelete.ts` which can't access that local variable. We need to export the Redis client from a shared module.

**Files:**
- Create: `dashboard/backend/src/redis.ts`
- Modify: `dashboard/backend/src/index.ts`

**Step 1: Create `dashboard/backend/src/redis.ts`**

```typescript
import { Redis } from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
```

**Step 2: Update `dashboard/backend/src/index.ts` to import from the shared module**

Find these two lines near the top of `index.ts`:
```typescript
import { Redis } from 'ioredis';
```
and:
```typescript
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
```

Replace the `Redis` import with:
```typescript
import { redis } from './redis.js';
```

Remove the `const redis = new Redis(...)` line entirely. The `redis` variable reference in the session store setup below it stays the same — it now comes from the import.

**Step 3: Build check**

```bash
cd /home/plex/wall-e-bot/dashboard/backend && ../../node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add dashboard/backend/src/redis.ts dashboard/backend/src/index.ts
git commit -m "refactor: extract shared Redis client module in backend"
```

---

### Task 2: Add run endpoints to backend autoDelete routes

**Context:** `dashboard/backend/src/routes/autoDelete.ts` handles all auto-delete CRUD. We add two POST routes that publish to Redis and return 204. The `/:id/run` route must come BEFORE `/:id` catch-all patterns — but since there are no catch-all routes here, order doesn't matter. Place both at the end of the file.

**Files:**
- Modify: `dashboard/backend/src/routes/autoDelete.ts`

**Step 1: Add redis import at the top of `autoDelete.ts`**

After the existing imports, add:
```typescript
import { redis } from '../redis.js';
```

**Step 2: Add the two run routes at the end of the file (before the final blank line)**

```typescript
// POST /api/guilds/:guildId/auto-delete/run
autoDeleteRouter.post('/run', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  await redis.publish('auto-delete:trigger', JSON.stringify({ guildId }));
  res.status(204).end();
}));

// POST /api/guilds/:guildId/auto-delete/:id/run
autoDeleteRouter.post('/:id/run', asyncHandler(async (req, res) => {
  const { guildId, id } = req.params;
  if (!/^\d+$/.test(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  const result = await db.query(
    'SELECT id FROM auto_delete_channels WHERE id = $1 AND guild_id = $2',
    [id, guildId],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  await redis.publish('auto-delete:trigger', JSON.stringify({ guildId, configId: parseInt(id, 10) }));
  res.status(204).end();
}));
```

**Step 3: Build check**

```bash
cd /home/plex/wall-e-bot/dashboard/backend && ../../node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add dashboard/backend/src/routes/autoDelete.ts
git commit -m "feat: add run-now endpoints to auto-delete backend routes"
```

---

### Task 3: Expose Redis on CacheService and add subscriber to SchedulerService

**Context:** `CacheService` (`bot/src/services/CacheService.ts`) holds the Redis connection as a private field `redis`. `SchedulerService` needs to call `.duplicate()` on it to create a subscriber connection (Redis pub/sub requires a dedicated connection). We expose it via a getter, then add the subscriber logic to `SchedulerService`.

**Files:**
- Modify: `bot/src/services/CacheService.ts`
- Modify: `bot/src/services/SchedulerService.ts`

**Step 1: Add `get redisClient()` getter to `CacheService`**

In `bot/src/services/CacheService.ts`, after the `close()` method (line 73), add:

```typescript
get redisClient(): Redis {
  return this.redis;
}
```

**Step 2: Add private subscriber field to `SchedulerService`**

In `SchedulerService`, the private fields block is at the top of the class (lines 49-52):
```typescript
private checkInterval: NodeJS.Timeout | null = null;
private autoCloseInterval: ReturnType<typeof setInterval> | null = null;
private autoDeleteInterval: ReturnType<typeof setInterval> | null = null;
private activityInterval: ReturnType<typeof setInterval> | null = null;
```

Add one more field:
```typescript
private autoDeleteSubscriber: import('ioredis').Redis | null = null;
```

**Step 3: Add `checkAutoDeleteForGuild` private method**

This is a guild-scoped variant of `checkAutoDelete()`. Add it directly after the existing `checkAutoDelete()` method (after line 485):

```typescript
private async checkAutoDeleteForGuild(guildId: string) {
  try {
    const result = await this.client.db.pool.query(
      `SELECT * FROM auto_delete_channels WHERE enabled = TRUE AND guild_id = $1`,
      [guildId],
    );
    for (const config of result.rows) {
      await this.runAutoDelete(config).catch(e =>
        logger.error(`Auto-delete failed for channel ${config.channel_id}:`, e),
      );
    }
  } catch (error) {
    logger.error(`Error in checkAutoDeleteForGuild for ${guildId}:`, error);
  }
}

private async runAutoDeleteById(configId: number, guildId: string) {
  try {
    const result = await this.client.db.pool.query(
      `SELECT * FROM auto_delete_channels WHERE id = $1 AND guild_id = $2`,
      [configId, guildId],
    );
    if (result.rows.length === 0) {
      logger.warn(`Auto-delete run-now: config ${configId} not found in guild ${guildId}`);
      return;
    }
    await this.runAutoDelete(result.rows[0]);
  } catch (error) {
    logger.error(`Error in runAutoDeleteById for config ${configId}:`, error);
  }
}
```

**Step 4: Start the subscriber in `start()`**

In the `start()` method, after the line `this.checkAutoDelete(); // run on start too` (around line 77), add:

```typescript
// Subscribe to Redis pub/sub for on-demand auto-delete triggers
this.autoDeleteSubscriber = this.client.cache.redisClient.duplicate();
this.autoDeleteSubscriber.subscribe('auto-delete:trigger', (err) => {
  if (err) logger.error('Failed to subscribe to auto-delete:trigger:', err);
  else logger.info('Subscribed to auto-delete:trigger channel');
});
this.autoDeleteSubscriber.on('message', (_channel, message) => {
  try {
    const payload = JSON.parse(message) as { guildId: string; configId?: number };
    if (payload.configId != null) {
      this.runAutoDeleteById(payload.configId, payload.guildId).catch(e =>
        logger.error('run-now single failed:', e),
      );
    } else {
      this.checkAutoDeleteForGuild(payload.guildId).catch(e =>
        logger.error('run-now all failed:', e),
      );
    }
  } catch (e) {
    logger.error('Failed to parse auto-delete:trigger message:', e);
  }
});
```

**Step 5: Tear down subscriber in `stop()`**

In the `stop()` method, after the existing `clearInterval` blocks (around line 100), add:

```typescript
if (this.autoDeleteSubscriber) {
  this.autoDeleteSubscriber.unsubscribe();
  this.autoDeleteSubscriber.disconnect();
  this.autoDeleteSubscriber = null;
}
```

**Step 6: Build check**

```bash
cd /home/plex/wall-e-bot/bot && ../../node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 7: Commit**

```bash
git add bot/src/services/CacheService.ts bot/src/services/SchedulerService.ts
git commit -m "feat: add Redis pub/sub subscriber for auto-delete run-now triggers"
```

---

### Task 4: Add Run Now buttons to AutoDeletePage frontend

**Context:** `dashboard/frontend/src/pages/guild/AutoDeletePage.tsx` is the page we just created. It needs:
1. A "Run All" button in the header (next to "Add Channel"), enabled only if there are enabled configs
2. A per-row "Run" button on each config card (between the toggle and delete button)
Both show a spinner while pending and brief "Done ✓" feedback after completion.

**Files:**
- Modify: `dashboard/frontend/src/pages/guild/AutoDeletePage.tsx`

**Step 1: Add `Play` to lucide-react imports**

Replace:
```tsx
import { Plus, Clock, Trash2 } from 'lucide-react';
```

With:
```tsx
import { Plus, Clock, Trash2, Play } from 'lucide-react';
```

**Step 2: Add run feedback state and mutations**

After the existing state declarations (after `const [formError, setFormError] = useState<string | null>(null);`), add:

```tsx
const [runAllDone, setRunAllDone] = useState(false);
const [runOneDone, setRunOneDone] = useState<number | null>(null);

const runAllMutation = useMutation({
  mutationFn: () => api.post(`/api/guilds/${guildId}/auto-delete/run`),
  onSuccess: () => {
    setRunAllDone(true);
    setTimeout(() => setRunAllDone(false), 3000);
  },
});

const runOneMutation = useMutation({
  mutationFn: (id: number) => api.post(`/api/guilds/${guildId}/auto-delete/${id}/run`),
  onSuccess: (_data, id) => {
    setRunOneDone(id);
    setTimeout(() => setRunOneDone(null), 3000);
  },
});
```

**Step 3: Add "Run Now" button to the header**

The header section currently is:
```tsx
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Auto-Delete</h2>
          <p className="text-sm text-discord-light mt-1">Automatically clean up old messages per channel. Pinned messages are always preserved.</p>
        </div>
        <button onClick={() => { setShowAdd(true); setFormError(null); }} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Channel
        </button>
      </div>
```

Replace with:
```tsx
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Auto-Delete</h2>
          <p className="text-sm text-discord-light mt-1">Automatically clean up old messages per channel. Pinned messages are always preserved.</p>
        </div>
        <div className="flex items-center gap-2">
          {configs.some(c => c.enabled) && (
            <button
              onClick={() => runAllMutation.mutate()}
              disabled={runAllMutation.isPending}
              className="btn btn-secondary flex items-center gap-2"
              title="Run all enabled auto-delete configs now"
            >
              {runAllMutation.isPending ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {runAllDone ? 'Done ✓' : 'Run All Now'}
            </button>
          )}
          <button onClick={() => { setShowAdd(true); setFormError(null); }} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Channel
          </button>
        </div>
      </div>
```

**Step 4: Add per-row run button**

The config row actions section currently is:
```tsx
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => toggleMutation.mutate({ id: config.id, enabled: !config.enabled })}
                className={`toggle ${config.enabled ? 'toggle-enabled' : 'toggle-disabled'}`}
              >
                <span className={`toggle-dot ${config.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
              <button
                onClick={() => window.confirm(`Remove auto-delete for #${channelName(config.channel_id)}?`) && deleteMutation.mutate(config.id)}
                className="btn bg-red-500/20 text-red-400 hover:bg-red-500/30 p-1.5"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
```

Replace with:
```tsx
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => toggleMutation.mutate({ id: config.id, enabled: !config.enabled })}
                className={`toggle ${config.enabled ? 'toggle-enabled' : 'toggle-disabled'}`}
              >
                <span className={`toggle-dot ${config.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
              <button
                onClick={() => runOneMutation.mutate(config.id)}
                disabled={runOneMutation.isPending && runOneMutation.variables === config.id}
                className="btn btn-secondary p-1.5"
                title="Run auto-delete for this channel now"
              >
                {runOneMutation.isPending && runOneMutation.variables === config.id ? (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin block" />
                ) : runOneDone === config.id ? (
                  <span className="text-xs text-green-400">✓</span>
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => window.confirm(`Remove auto-delete for #${channelName(config.channel_id)}?`) && deleteMutation.mutate(config.id)}
                className="btn bg-red-500/20 text-red-400 hover:bg-red-500/30 p-1.5"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
```

**Step 5: Build check**

```bash
cd /home/plex/wall-e-bot/dashboard/frontend && ../../node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 6: Commit**

```bash
git add dashboard/frontend/src/pages/guild/AutoDeletePage.tsx
git commit -m "feat: add Run Now buttons to Auto-Delete dashboard page"
```

---

### Task 5: Deploy

**Step 1: Push**

```bash
git push origin main
```

**Step 2: Deploy on VPS**

```bash
cd /opt/wall-e-bot && git pull && docker compose -f docker/docker-compose.yml build --no-cache && docker compose -f docker/docker-compose.yml up -d
```

No migration needed — no schema changes.

**Step 3: Verify**

- Navigate to Moderation → Auto-Delete in the dashboard
- If enabled configs exist, "Run All Now" button appears in the header
- Each config row has a Play button
- Click "Run All Now" → button shows spinner then "Done ✓" after a moment
- Check bot logs: should see `Subscribed to auto-delete:trigger channel` on startup and deletion activity when triggered
