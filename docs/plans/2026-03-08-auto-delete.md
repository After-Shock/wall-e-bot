# Auto-Delete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-channel automatic message cleanup — delete messages older than N hours and/or keep only the most recent N messages, with exempt roles and pinned messages always preserved.

**Architecture:** New `auto_delete_channels` DB table; `checkAutoDelete()` method added to the existing `SchedulerService` (runs hourly alongside `checkAutoClose`); REST routes in a new `autoDelete.ts` router; new `AutoDeleteTab` inline component in `GuildPage.tsx`.

**Tech Stack:** discord.js (TextChannel.bulkDelete + message.delete), PostgreSQL, Express/Zod, React + TanStack Query

---

### Task 1: DB migration

**Files:**
- Modify: `dashboard/backend/src/db/migrate.ts:379-389`

**Step 1: Add the table + index to the SQL string**

Find the line:
```
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS description TEXT;
```
Add immediately after it (before the `-- Dashboard access roles` comment):

```sql
-- Auto-delete channel configuration
CREATE TABLE IF NOT EXISTS auto_delete_channels (
  id             SERIAL PRIMARY KEY,
  guild_id       VARCHAR(20) NOT NULL,
  channel_id     VARCHAR(20) NOT NULL,
  max_age_hours  INTEGER,
  max_messages   INTEGER,
  exempt_roles   TEXT[] DEFAULT '{}',
  enabled        BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMP DEFAULT NOW(),
  UNIQUE (guild_id, channel_id)
);
CREATE INDEX IF NOT EXISTS idx_auto_delete_guild ON auto_delete_channels(guild_id) WHERE enabled = TRUE;
```

**Step 2: TypeScript-check the backend**

```bash
node_modules/.bin/tsc --noEmit -p dashboard/backend/tsconfig.json
```
Expected: no errors

**Step 3: Commit**

```bash
git add dashboard/backend/src/db/migrate.ts
git commit -m "feat: add auto_delete_channels migration"
```

---

### Task 2: Backend — channels endpoint

There is no `GET /:guildId/channels` endpoint yet. The frontend needs it for the channel picker.

**Files:**
- Modify: `dashboard/backend/src/routes/guilds.ts` — add after the existing `/:guildId/roles` endpoint at the end of the file

**Step 1: Add the endpoint**

Append before the final export (or at the end of the router, after the roles endpoint):

```typescript
// GET /guilds/:guildId/channels — returns text channels for dropdowns
guildsRouter.get('/:guildId/channels', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!response.ok) { res.status(502).json({ error: 'Failed to fetch channels' }); return; }
  const all = await response.json() as { id: string; name: string; type: number; position: number; parent_id: string | null }[];
  // Type 0 = text channel, type 5 = announcement channel
  const text = all
    .filter(c => c.type === 0 || c.type === 5)
    .sort((a, b) => a.position - b.position)
    .map(c => ({ id: c.id, name: c.name, parent_id: c.parent_id }));
  res.json(text);
}));
```

**Step 2: TypeScript-check**

```bash
node_modules/.bin/tsc --noEmit -p dashboard/backend/tsconfig.json
```
Expected: no errors

**Step 3: Commit**

```bash
git add dashboard/backend/src/routes/guilds.ts
git commit -m "feat: add GET /:guildId/channels endpoint"
```

---

### Task 3: Backend — auto-delete CRUD routes

**Files:**
- Create: `dashboard/backend/src/routes/autoDelete.ts`

**Step 1: Create the file**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const autoDeleteRouter = Router({ mergeParams: true });

autoDeleteRouter.use(requireAuth, requireGuildAccess);

const AutoDeleteSchema = z.object({
  channel_id: z.string().min(1).max(20),
  max_age_hours: z.number().int().min(1).max(8760).nullable().optional(), // max 1 year
  max_messages: z.number().int().min(1).max(10000).nullable().optional(),
  exempt_roles: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
}).refine(d => d.max_age_hours != null || d.max_messages != null, {
  message: 'At least one of max_age_hours or max_messages must be set',
});

// GET /api/guilds/:guildId/auto-delete
autoDeleteRouter.get('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const result = await db.query(
    'SELECT * FROM auto_delete_channels WHERE guild_id = $1 ORDER BY created_at',
    [guildId],
  );
  res.json(result.rows);
}));

// POST /api/guilds/:guildId/auto-delete
autoDeleteRouter.post('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const parsed = AutoDeleteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
  const d = parsed.data;
  const result = await db.query(
    `INSERT INTO auto_delete_channels (guild_id, channel_id, max_age_hours, max_messages, exempt_roles, enabled)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (guild_id, channel_id) DO UPDATE SET
       max_age_hours = $3, max_messages = $4, exempt_roles = $5, enabled = $6
     RETURNING *`,
    [guildId, d.channel_id, d.max_age_hours ?? null, d.max_messages ?? null, d.exempt_roles, d.enabled],
  );
  res.status(201).json(result.rows[0]);
}));

// PATCH /api/guilds/:guildId/auto-delete/:id
autoDeleteRouter.patch('/:id', asyncHandler(async (req, res) => {
  const { guildId, id } = req.params;
  const parsed = AutoDeleteSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
  const d = parsed.data;
  const fields = Object.keys(d) as (keyof typeof d)[];
  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
  const setClauses = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const values = fields.map(f => d[f]);
  const result = await db.query(
    `UPDATE auto_delete_channels SET ${setClauses} WHERE id = $1 AND guild_id = $2 RETURNING *`,
    [id, guildId, ...values],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(result.rows[0]);
}));

// DELETE /api/guilds/:guildId/auto-delete/:id
autoDeleteRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { guildId, id } = req.params;
  const result = await db.query(
    'DELETE FROM auto_delete_channels WHERE id = $1 AND guild_id = $2 RETURNING id',
    [id, guildId],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ success: true });
}));
```

**Step 2: Wire up in `dashboard/backend/src/index.ts`**

Add import at top with other router imports:
```typescript
import { autoDeleteRouter } from './routes/autoDelete.js';
```

Add route registration after the `dashboardRoles` line:
```typescript
app.use('/api/guilds/:guildId/auto-delete', autoDeleteRouter);
```

**Step 3: TypeScript-check**

```bash
node_modules/.bin/tsc --noEmit -p dashboard/backend/tsconfig.json
```
Expected: no errors

**Step 4: Commit**

```bash
git add dashboard/backend/src/routes/autoDelete.ts dashboard/backend/src/index.ts
git commit -m "feat: add auto-delete CRUD API routes"
```

---

### Task 4: Bot — checkAutoDelete in SchedulerService

**Files:**
- Modify: `bot/src/services/SchedulerService.ts`

**Step 1: Add the `autoDeleteInterval` field**

In the class property declarations (around line 49-51, alongside `checkInterval`, `autoCloseInterval`, `activityInterval`), add:
```typescript
private autoDeleteInterval: ReturnType<typeof setInterval> | null = null;
```

**Step 2: Start the interval in `start()`**

After the `checkAutoClose` interval setup (around line 72), add:
```typescript
// Check auto-delete channels every hour
this.autoDeleteInterval = setInterval(() => { this.checkAutoDelete(); }, 60 * 60 * 1000);
this.checkAutoDelete(); // run on start too
```

**Step 3: Stop in `stop()`**

Add inside `stop()` alongside the other clearInterval calls:
```typescript
if (this.autoDeleteInterval) {
  clearInterval(this.autoDeleteInterval);
  this.autoDeleteInterval = null;
}
```

**Step 4: Add the `checkAutoDelete` method**

Add as a new private method after `checkAutoClose` (wherever that method ends):

```typescript
private async checkAutoDelete() {
  try {
    const result = await this.client.db.pool.query(
      `SELECT * FROM auto_delete_channels WHERE enabled = TRUE`,
    );
    for (const config of result.rows) {
      await this.runAutoDelete(config).catch(e =>
        logger.error(`Auto-delete failed for channel ${config.channel_id}:`, e),
      );
    }
  } catch (error) {
    logger.error('Error in checkAutoDelete:', error);
  }
}

private async runAutoDelete(config: {
  guild_id: string;
  channel_id: string;
  max_age_hours: number | null;
  max_messages: number | null;
  exempt_roles: string[];
}) {
  const guild = this.client.guilds.cache.get(config.guild_id);
  if (!guild) return;

  const channel = guild.channels.cache.get(config.channel_id);
  if (!channel || !channel.isTextBased()) return;
  const textChannel = channel as TextChannel;

  // Fetch all messages (paginated, up to 500 max to avoid abuse)
  const allMessages: import('discord.js').Message[] = [];
  let lastId: string | undefined;
  for (let page = 0; page < 5; page++) {
    const batch = await textChannel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
    if (batch.size === 0) break;
    allMessages.push(...batch.values());
    lastId = batch.last()?.id;
    if (batch.size < 100) break;
  }

  // Filter out pinned messages and messages from exempt roles
  const candidates = allMessages.filter(msg => {
    if (msg.pinned) return false;
    if (config.exempt_roles.length > 0) {
      const memberRoles = msg.member?.roles.cache;
      if (memberRoles && config.exempt_roles.some(r => memberRoles.has(r))) return false;
    }
    return true;
  });

  // Determine which messages to delete
  const toDelete: import('discord.js').Message[] = [];
  const now = Date.now();
  const cutoff = config.max_age_hours ? now - config.max_age_hours * 60 * 60 * 1000 : null;

  // Sort newest first
  const sorted = candidates.sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  sorted.forEach((msg, index) => {
    let shouldDelete = false;
    if (cutoff && msg.createdTimestamp < cutoff) shouldDelete = true;
    if (config.max_messages != null && index >= config.max_messages) shouldDelete = true;
    if (shouldDelete) toDelete.push(msg);
  });

  if (toDelete.length === 0) return;

  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
  const bulk = toDelete.filter(m => m.createdTimestamp > fourteenDaysAgo);
  const individual = toDelete.filter(m => m.createdTimestamp <= fourteenDaysAgo);

  // Bulk delete recent messages (batches of 100)
  for (let i = 0; i < bulk.length; i += 100) {
    const batch = bulk.slice(i, i + 100);
    await textChannel.bulkDelete(batch, true).catch(e =>
      logger.error(`Bulk delete failed in ${config.channel_id}:`, e),
    );
  }

  // Delete old messages one by one (rate-limit friendly)
  for (const msg of individual) {
    await msg.delete().catch(() => null);
    await new Promise(r => setTimeout(r, 1000));
  }

  logger.info(`Auto-delete: removed ${toDelete.length} messages from ${config.channel_id} in ${config.guild_id}`);
}
```

**Step 5: TypeScript-check the bot**

```bash
node_modules/.bin/tsc --noEmit -p bot/tsconfig.json
```
Expected: no errors

**Step 6: Commit**

```bash
git add bot/src/services/SchedulerService.ts
git commit -m "feat: add checkAutoDelete to SchedulerService"
```

---

### Task 5: Frontend — AutoDeleteTab in GuildPage.tsx

**Files:**
- Modify: `dashboard/frontend/src/pages/GuildPage.tsx`

**Step 1: Add the `Trash2` icon import**

The file currently imports from lucide-react:
```typescript
import { ArrowLeft, Save, Shield, Star, MessageSquare, Bot, Settings, Loader2, Image, Activity } from 'lucide-react';
```
Add `Trash2` and `Plus` and `Clock` to the import list:
```typescript
import { ArrowLeft, Save, Shield, Star, MessageSquare, Bot, Settings, Loader2, Image, Activity, Trash2, Plus, Clock } from 'lucide-react';
```

**Step 2: Add the `AutoDeleteTab` component**

Add this component after the `DashboardAccessTab` function (near the end of the file, before the closing of the module):

```typescript
// ─── Auto-Delete Tab ──────────────────────────────────────────────────────────

interface AutoDeleteConfig {
  id: number;
  guild_id: string;
  channel_id: string;
  max_age_hours: number | null;
  max_messages: number | null;
  exempt_roles: string[];
  enabled: boolean;
}

interface DiscordChannel {
  id: string;
  name: string;
  parent_id: string | null;
}

interface DiscordRole {
  id: string;
  name: string;
  color: number;
}

function AutoDeleteTab({ guildId }: { guildId: string }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<{
    channel_id: string;
    max_age_hours: string;
    max_messages: string;
    exempt_roles: string[];
  }>({ channel_id: '', max_age_hours: '', max_messages: '', exempt_roles: [] });
  const [formError, setFormError] = useState<string | null>(null);

  const { data: configs = [] } = useQuery<AutoDeleteConfig[]>({
    queryKey: ['auto-delete', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/auto-delete`).then(r => r.data),
  });

  const { data: channels = [] } = useQuery<DiscordChannel[]>({
    queryKey: ['channels', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/channels`).then(r => r.data),
  });

  const { data: roles = [] } = useQuery<DiscordRole[]>({
    queryKey: ['roles', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/roles`).then(r => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['auto-delete', guildId] });

  const addMutation = useMutation({
    mutationFn: (data: object) => api.post(`/api/guilds/${guildId}/auto-delete`, data).then(r => r.data),
    onSuccess: () => { invalidate(); setShowAdd(false); setForm({ channel_id: '', max_age_hours: '', max_messages: '', exempt_roles: [] }); setFormError(null); },
    onError: (e: unknown) => setFormError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.patch(`/api/guilds/${guildId}/auto-delete/${id}`, { enabled }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/guilds/${guildId}/auto-delete/${id}`),
    onSuccess: invalidate,
  });

  const channelName = (id: string) => channels.find(c => c.id === id)?.name ?? id;
  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? id;

  const handleAdd = () => {
    if (!form.channel_id) { setFormError('Select a channel'); return; }
    if (!form.max_age_hours && !form.max_messages) { setFormError('Set at least one limit (age or message count)'); return; }
    addMutation.mutate({
      channel_id: form.channel_id,
      max_age_hours: form.max_age_hours ? parseInt(form.max_age_hours) : null,
      max_messages: form.max_messages ? parseInt(form.max_messages) : null,
      exempt_roles: form.exempt_roles,
    });
  };

  const usedChannelIds = new Set(configs.map(c => c.channel_id));
  const availableChannels = channels.filter(c => !usedChannelIds.has(c.id));

  return (
    <div className="space-y-6">
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

      {showAdd && (
        <div className="card space-y-4 border border-discord-blurple/30">
          <h3 className="font-semibold">Configure Channel</h3>

          <div>
            <label className="block text-sm font-medium mb-1">Channel</label>
            <select value={form.channel_id} onChange={e => setForm(f => ({ ...f, channel_id: e.target.value }))} className="input w-full">
              <option value="">— Select channel —</option>
              {availableChannels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Max age (hours)</label>
              <input type="number" min="1" max="8760" value={form.max_age_hours} onChange={e => setForm(f => ({ ...f, max_age_hours: e.target.value }))} className="input w-full" placeholder="e.g. 24" />
              <p className="text-xs text-discord-light mt-1">Delete messages older than this</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max messages</label>
              <input type="number" min="1" max="10000" value={form.max_messages} onChange={e => setForm(f => ({ ...f, max_messages: e.target.value }))} className="input w-full" placeholder="e.g. 50" />
              <p className="text-xs text-discord-light mt-1">Keep only this many recent messages</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Exempt roles <span className="text-discord-light font-normal">(messages from these roles are never deleted)</span></label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.exempt_roles.map(id => (
                <span key={id} className="flex items-center gap-1 bg-discord-darker px-2 py-0.5 rounded text-xs">
                  {roleName(id)}
                  <button onClick={() => setForm(f => ({ ...f, exempt_roles: f.exempt_roles.filter(r => r !== id) }))} className="text-discord-light hover:text-white">×</button>
                </span>
              ))}
            </div>
            <select
              value=""
              onChange={e => { if (e.target.value) setForm(f => ({ ...f, exempt_roles: [...f.exempt_roles, e.target.value] })); }}
              className="input w-full"
            >
              <option value="">— Add exempt role —</option>
              {roles.filter(r => !form.exempt_roles.includes(r.id)).map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {formError && <p className="text-sm text-red-400">{formError}</p>}

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAdd(false); setFormError(null); }} className="btn btn-secondary">Cancel</button>
            <button onClick={handleAdd} disabled={addMutation.isPending} className="btn btn-primary">
              {addMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {configs.length === 0 && !showAdd && (
        <div className="text-center py-12 text-discord-light">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No channels configured. Add a channel to start auto-deleting messages.</p>
        </div>
      )}

      <div className="space-y-3">
        {configs.map(config => (
          <div key={config.id} className="card flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium">#{channelName(config.channel_id)}</p>
              <p className="text-xs text-discord-light mt-0.5">
                {config.max_age_hours ? `Older than ${config.max_age_hours}h` : ''}
                {config.max_age_hours && config.max_messages ? ' · ' : ''}
                {config.max_messages ? `Keep last ${config.max_messages} messages` : ''}
                {config.exempt_roles.length > 0 && ` · Exempt: ${config.exempt_roles.map(id => roleName(id)).join(', ')}`}
              </p>
            </div>
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
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Add the tab to the sidebar in `GuildPage()`**

Find:
```typescript
  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'moderation', label: 'Moderation', icon: Shield },
    { id: 'leveling', label: 'Leveling', icon: Star },
    { id: 'welcome', label: 'Welcome', icon: MessageSquare },
    { id: 'customization', label: 'Customization', icon: Bot },
    { id: 'access', label: 'Access', icon: Shield },
  ];
```
Replace with:
```typescript
  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'moderation', label: 'Moderation', icon: Shield },
    { id: 'leveling', label: 'Leveling', icon: Star },
    { id: 'welcome', label: 'Welcome', icon: MessageSquare },
    { id: 'customization', label: 'Customization', icon: Bot },
    { id: 'access', label: 'Access', icon: Shield },
    { id: 'auto-delete', label: 'Auto-Delete', icon: Trash2 },
  ];
```

**Step 4: Add the tab content render**

Find the block:
```typescript
            {activeTab === 'access' && (
              <DashboardAccessTab guildId={guildId!} />
            )}
```
Add after it:
```typescript
            {activeTab === 'auto-delete' && (
              <AutoDeleteTab guildId={guildId!} />
            )}
```

Also remove the Save button footer (the `<div className="mt-8 pt-6 border-t...">` block at the bottom of the card content) from rendering when on the auto-delete tab — wrap it:
```typescript
            {activeTab !== 'auto-delete' && activeTab !== 'access' && (
              <div className="mt-8 pt-6 border-t border-discord-darker flex justify-end">
                ...
              </div>
            )}
```

**Step 5: TypeScript-check the frontend**

```bash
node_modules/.bin/tsc --noEmit -p dashboard/frontend/tsconfig.json
```
Expected: no errors

**Step 6: Commit**

```bash
git add dashboard/frontend/src/pages/GuildPage.tsx
git commit -m "feat: add Auto-Delete tab to guild settings"
```

---

### Task 6: Deploy

**Step 1: Push to remote**

```bash
git push origin main
```

**Step 2: Deploy on VPS**

```bash
cd /opt/wall-e-bot && git pull && docker compose -f docker/docker-compose.yml build --no-cache && docker compose -f docker/docker-compose.yml up -d && docker compose -f docker/docker-compose.yml exec backend node dist/db/migrate.js
```

**Step 3: Verify**

- Navigate to a guild's Settings → Auto-Delete tab
- Add a channel with a max age and/or max count
- Confirm the row appears and the enabled toggle works
- Check bot logs an hour later for `Auto-delete: removed X messages`
