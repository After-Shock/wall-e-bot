# Bot Lockdown & Admin Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Lock the bot to whitelisted servers only, and build an owner-only admin panel in the dashboard to track all guilds and manage access.

**Architecture:** A `guild_whitelist` PostgreSQL table tracks every server the bot is/was in with a `pending/approved/blacklisted` status. The bot checks this on every interaction and ignores non-approved guilds. The backend exposes `/api/admin/*` routes gated by a `requireBotOwner` middleware (compares Discord user ID to `BOT_OWNER_ID` env var). The frontend adds a `/admin` route visible only to the bot owner.

**Tech Stack:** TypeScript, Discord.js, Express, PostgreSQL, React, React Query, Tailwind/discord theme

---

## Codebase Context

- Bot lives in `bot/src/`, events in `bot/src/events/`, DB pool at `client.db.pool`
- Backend lives in `dashboard/backend/src/`, routes registered in `dashboard/backend/src/index.ts`
- Frontend lives in `dashboard/frontend/src/`, routes in `dashboard/frontend/src/App.tsx`
- Auth middleware at `dashboard/backend/src/middleware/auth.ts` — has `requireAuth`, `requireGuildAccess`
- Env var `BOT_OWNER_ID` already used in `bot/src/events/interactionCreate.ts` for owner-only commands
- `asyncHandler` wrapper used on all backend routes — import from `../utils/asyncHandler.js`
- Frontend API client: `import { api } from '../../services/api'` (relative URLs, credentials included)
- `interactionCreate.ts` already checks `process.env.BOT_OWNER_ID` for owner-only commands

---

### Task 1: DB Migration — guild_whitelist table

**Files:**
- Modify: `dashboard/backend/src/db/migrate.ts` (near end, before indexes section)

**Step 1: Add the table to the migration schema string**

Find the line `-- Indexes` near the end of the schema string and insert before it:

```sql
-- Guild whitelist table
CREATE TABLE IF NOT EXISTS guild_whitelist (
  guild_id VARCHAR(20) PRIMARY KEY,
  guild_name VARCHAR(100) NOT NULL,
  guild_icon VARCHAR(100),
  member_count INTEGER DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  added_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  left_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guild_whitelist_status ON guild_whitelist(status);
```

**Step 2: Commit**

```bash
git add dashboard/backend/src/db/migrate.ts
git commit -m "feat: add guild_whitelist table to migration"
```

---

### Task 2: Bot — Sync Guilds on Ready + Handle guildCreate / guildDelete

**Files:**
- Modify: `bot/src/events/ready.ts`
- Create: `bot/src/events/guildCreate.ts`
- Create: `bot/src/events/guildDelete.ts`

**Context:** The bot's DB pool is at `client.db.pool`. Guild objects have `.id`, `.name`, `.icon`, `.memberCount`. On ready, upsert all current guilds as `approved` (they were manually added before whitelist existed). New guilds after deploy get `pending` status. When bot is removed, set `left_at`.

**Step 1: Update `bot/src/events/ready.ts`** — add guild sync after the presence lines:

```typescript
import { Events, ActivityType } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client: WallEClient) {
    logger.info(`Ready! Logged in as ${client.user?.tag}`);
    logger.info(`Serving ${client.guilds.cache.size} guilds`);

    // Set presence
    client.user?.setPresence({
      activities: [{ name: `/help | ${client.guilds.cache.size} servers`, type: ActivityType.Watching }],
      status: 'online',
    });
    setInterval(() => {
      client.user?.setPresence({
        activities: [{ name: `/help | ${client.guilds.cache.size} servers`, type: ActivityType.Watching }],
        status: 'online',
      });
    }, 5 * 60 * 1000);

    // Sync all current guilds into whitelist as 'approved'
    // (these were added before whitelist existed so we trust them)
    for (const [, guild] of client.guilds.cache) {
      await client.db.pool.query(
        `INSERT INTO guild_whitelist (guild_id, guild_name, guild_icon, member_count, status)
         VALUES ($1, $2, $3, $4, 'approved')
         ON CONFLICT (guild_id) DO UPDATE SET
           guild_name = EXCLUDED.guild_name,
           guild_icon = EXCLUDED.guild_icon,
           member_count = EXCLUDED.member_count,
           left_at = NULL`,
        [guild.id, guild.name, guild.icon, guild.memberCount]
      ).catch(e => logger.error('Failed to sync guild to whitelist:', e));
    }
    logger.info('Guild whitelist synced');
  },
};
```

**Step 2: Create `bot/src/events/guildCreate.ts`**

```typescript
import { Events, Guild } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildCreate,
  once: false,
  async execute(client: WallEClient, guild: Guild) {
    logger.info(`Joined new guild: ${guild.name} (${guild.id})`);

    // Add to whitelist as pending — owner must approve via admin panel
    await client.db.pool.query(
      `INSERT INTO guild_whitelist (guild_id, guild_name, guild_icon, member_count, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (guild_id) DO UPDATE SET
         guild_name = EXCLUDED.guild_name,
         guild_icon = EXCLUDED.guild_icon,
         member_count = EXCLUDED.member_count,
         status = CASE WHEN guild_whitelist.status = 'blacklisted' THEN 'blacklisted' ELSE 'pending' END,
         left_at = NULL`,
      [guild.id, guild.name, guild.icon, guild.memberCount]
    ).catch(e => logger.error('Failed to add guild to whitelist:', e));

    // DM the bot owner about the new pending guild
    const ownerId = process.env.BOT_OWNER_ID;
    if (ownerId) {
      try {
        const owner = await client.users.fetch(ownerId);
        await owner.send(
          `📥 **New server added bot:** ${guild.name} (${guild.id})\n` +
          `Members: ${guild.memberCount}\n` +
          `Status: **pending** — approve or blacklist in the admin panel.`
        );
      } catch {
        // Owner has DMs disabled
      }
    }

    // If blacklisted, leave immediately
    const result = await client.db.pool.query(
      'SELECT status FROM guild_whitelist WHERE guild_id = $1',
      [guild.id]
    ).catch(() => null);

    if (result?.rows[0]?.status === 'blacklisted') {
      await guild.leave();
      logger.info(`Left blacklisted guild: ${guild.name}`);
    }
  },
};
```

**Step 3: Create `bot/src/events/guildDelete.ts`**

```typescript
import { Events, Guild } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildDelete,
  once: false,
  async execute(client: WallEClient, guild: Guild) {
    logger.info(`Left/removed from guild: ${guild.name} (${guild.id})`);
    await client.db.pool.query(
      `UPDATE guild_whitelist SET left_at = NOW() WHERE guild_id = $1`,
      [guild.id]
    ).catch(e => logger.error('Failed to update guild left_at:', e));
  },
};
```

**Step 4: Commit**

```bash
git add bot/src/events/ready.ts bot/src/events/guildCreate.ts bot/src/events/guildDelete.ts
git commit -m "feat: sync guilds to whitelist on ready, handle guildCreate/Delete"
```

---

### Task 3: Bot — Enforce Whitelist on Interactions and Messages

**Files:**
- Modify: `bot/src/events/interactionCreate.ts` (add check near top of execute, after modal check)
- Modify: `bot/src/events/messageCreate.ts` (add check near top)

**Context:** Check `guild_whitelist` status for the guild. If not `approved`, silently return (don't reply — just ignore). Owner interactions always pass through.

**Step 1: Add whitelist check to `interactionCreate.ts`**

After the modal submit block (after line 104, `return;` that closes the modal block), and before the `if (!interaction.isChatInputCommand()) return;` line, add:

```typescript
    // Whitelist check — ignore guilds that aren't approved
    if (interaction.guildId) {
      const isOwner = interaction.user.id === process.env.BOT_OWNER_ID;
      if (!isOwner) {
        const wl = await client.db.pool.query(
          'SELECT status FROM guild_whitelist WHERE guild_id = $1',
          [interaction.guildId]
        ).catch(() => null);
        const status = wl?.rows[0]?.status;
        if (status !== 'approved') {
          if (interaction.isChatInputCommand()) {
            await interaction.reply({
              content: '⚠️ This server has not been approved to use this bot. Please contact the bot owner.',
              ephemeral: true,
            }).catch(() => {});
          }
          return;
        }
      }
    }
```

**Step 2: Add whitelist check to `messageCreate.ts`**

After `if (message.author.bot) return;`, add:

```typescript
    // Whitelist check
    if (message.guild) {
      const wl = await client.db.pool.query(
        'SELECT status FROM guild_whitelist WHERE guild_id = $1',
        [message.guild.id]
      ).catch(() => null);
      if (wl?.rows[0]?.status !== 'approved' && message.author.id !== process.env.BOT_OWNER_ID) return;
    }
```

**Step 3: Commit**

```bash
git add bot/src/events/interactionCreate.ts bot/src/events/messageCreate.ts
git commit -m "feat: enforce guild whitelist on all interactions and messages"
```

---

### Task 4: Backend — requireBotOwner Middleware + Admin Routes

**Files:**
- Modify: `dashboard/backend/src/middleware/auth.ts`
- Create: `dashboard/backend/src/routes/admin.ts`

**Step 1: Add `requireBotOwner` to `auth.ts`** — append after `requireGuildAccess`:

```typescript
export const requireBotOwner: RequestHandler = (req, res, next) => {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const ownerIds = (process.env.BOT_OWNER_ID || '').split(',').map(s => s.trim());
  if (!ownerIds.includes(user.id)) {
    res.status(403).json({ error: 'Bot owner only' });
    return;
  }
  next();
};
```

**Step 2: Create `dashboard/backend/src/routes/admin.ts`**

```typescript
import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireBotOwner } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';

export const adminRouter = Router();

// All admin routes require auth + bot owner
adminRouter.use(requireAuth, requireBotOwner);

// GET /api/admin/stats — overall bot stats
adminRouter.get('/stats', asyncHandler(async (req, res) => {
  const [guilds, users, pending] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM guild_whitelist WHERE left_at IS NULL`),
    db.query(`SELECT COUNT(*) FROM guild_members`),
    db.query(`SELECT COUNT(*) FROM guild_whitelist WHERE status = 'pending' AND left_at IS NULL`),
  ]);
  res.json({
    totalGuilds: parseInt(guilds.rows[0].count),
    totalUsers: parseInt(users.rows[0].count),
    pendingGuilds: parseInt(pending.rows[0].count),
  });
}));

// GET /api/admin/guilds — list all guilds with status
adminRouter.get('/guilds', asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT guild_id, guild_name, guild_icon, member_count, status, added_at, approved_at, left_at
     FROM guild_whitelist
     ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, added_at DESC`
  );
  res.json(result.rows.map(r => ({
    id: r.guild_id,
    name: r.guild_name,
    icon: r.guild_icon,
    memberCount: r.member_count,
    status: r.status,
    addedAt: r.added_at,
    approvedAt: r.approved_at,
    leftAt: r.left_at,
  })));
}));

// POST /api/admin/guilds/:guildId/approve
adminRouter.post('/guilds/:guildId/approve', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  await db.query(
    `UPDATE guild_whitelist SET status = 'approved', approved_at = NOW() WHERE guild_id = $1`,
    [guildId]
  );
  logger.info(`Admin approved guild ${guildId}`);
  res.json({ success: true });
}));

// POST /api/admin/guilds/:guildId/blacklist
adminRouter.post('/guilds/:guildId/blacklist', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  await db.query(
    `UPDATE guild_whitelist SET status = 'blacklisted' WHERE guild_id = $1`,
    [guildId]
  );
  // Tell bot to leave via Discord API
  const leaveRes = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  logger.info(`Admin blacklisted guild ${guildId}, bot leave: ${leaveRes.status}`);
  res.json({ success: true });
}));

// DELETE /api/admin/guilds/:guildId — leave guild (keep as approved)
adminRouter.delete('/guilds/:guildId', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  logger.info(`Admin left guild ${guildId}`);
  res.json({ success: true });
}));
```

**Step 3: Commit**

```bash
git add dashboard/backend/src/middleware/auth.ts dashboard/backend/src/routes/admin.ts
git commit -m "feat: add requireBotOwner middleware and admin API routes"
```

---

### Task 5: Backend — Register Admin Router

**Files:**
- Modify: `dashboard/backend/src/index.ts`

**Step 1: Import and register the admin router**

Add import near the other router imports:
```typescript
import { adminRouter } from './routes/admin.js';
```

Add the route registration after the existing route registrations (after `app.use('/api/bot', botRouter)`):
```typescript
app.use('/api/admin', adminRouter);
```

**Step 2: Commit**

```bash
git add dashboard/backend/src/index.ts
git commit -m "feat: register admin router at /api/admin"
```

---

### Task 6: Frontend — Admin Page

**Files:**
- Create: `dashboard/frontend/src/pages/AdminPage.tsx`

**Context:**
- Auth context is at `dashboard/frontend/src/context/AuthContext.tsx` — `useAuth()` returns `{ user }` where `user.id` is their Discord ID
- Bot owner ID needs to be exposed to frontend — use env var `VITE_BOT_OWNER_ID` in the frontend `.env`
- API client: `import { api } from '../services/api'`
- Use React Query for data fetching
- Show 3 stat cards at top, then a guild table with approve/blacklist/leave actions
- Status badge colors: pending=yellow, approved=green, blacklisted=red, left=gray

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Shield, Server, Users, Clock, CheckCircle, XCircle, LogOut, AlertTriangle } from 'lucide-react';

interface AdminGuild {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  status: 'pending' | 'approved' | 'blacklisted';
  addedAt: string;
  approvedAt: string | null;
  leftAt: string | null;
}

interface AdminStats {
  totalGuilds: number;
  totalUsers: number;
  pendingGuilds: number;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  approved: 'bg-green-500/20 text-green-400',
  blacklisted: 'bg-red-500/20 text-red-400',
};

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const ownerIds = (import.meta.env.VITE_BOT_OWNER_ID || '').split(',').map((s: string) => s.trim());
  const isOwner = user && ownerIds.includes(user.id);

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-discord-light">This area is restricted to bot owners only.</p>
        </div>
      </div>
    );
  }

  const { data: stats } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/api/admin/stats').then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: guilds, isLoading } = useQuery<AdminGuild[]>({
    queryKey: ['admin-guilds'],
    queryFn: () => api.get('/api/admin/guilds').then(r => r.data),
    refetchInterval: 30_000,
  });

  const approve = useMutation({
    mutationFn: (guildId: string) => api.post(`/api/admin/guilds/${guildId}/approve`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-guilds'] }); queryClient.invalidateQueries({ queryKey: ['admin-stats'] }); },
  });

  const blacklist = useMutation({
    mutationFn: (guildId: string) => api.post(`/api/admin/guilds/${guildId}/blacklist`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-guilds'] }); queryClient.invalidateQueries({ queryKey: ['admin-stats'] }); },
  });

  const leave = useMutation({
    mutationFn: (guildId: string) => api.delete(`/api/admin/guilds/${guildId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-guilds'] }),
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-discord-blurple" />
        <div>
          <h1 className="text-2xl font-bold">Bot Admin Panel</h1>
          <p className="text-discord-light">Manage servers and access control</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <Server className="w-5 h-5 text-discord-blurple" />
          </div>
          <div className="text-3xl font-bold">{stats?.totalGuilds ?? '—'}</div>
          <div className="text-sm text-discord-light">Active Servers</div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-3xl font-bold">{stats?.totalUsers ?? '—'}</div>
          <div className="text-sm text-discord-light">Tracked Users</div>
        </div>
        <div className="card border border-yellow-500/30">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-5 h-5 text-yellow-400" />
            {(stats?.pendingGuilds ?? 0) > 0 && (
              <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
                {stats!.pendingGuilds} new
              </span>
            )}
          </div>
          <div className="text-3xl font-bold">{stats?.pendingGuilds ?? '—'}</div>
          <div className="text-sm text-discord-light">Pending Approval</div>
        </div>
      </div>

      {/* Guild Table */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">All Servers</h2>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple" />
          </div>
        ) : !guilds?.length ? (
          <p className="text-discord-light text-center py-8">No servers found</p>
        ) : (
          <div className="space-y-2">
            {guilds.map(guild => (
              <div key={guild.id} className={`bg-discord-darker rounded-lg p-4 flex items-center gap-4 ${guild.status === 'pending' ? 'border border-yellow-500/30' : ''}`}>
                {/* Icon */}
                {guild.icon ? (
                  <img
                    src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                    alt={guild.name}
                    className="w-10 h-10 rounded-full shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-discord-dark flex items-center justify-center shrink-0">
                    <Server className="w-5 h-5 text-discord-light" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">{guild.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[guild.status] ?? 'bg-discord-dark text-discord-light'}`}>
                      {guild.status}
                    </span>
                    {guild.leftAt && <span className="text-xs bg-discord-dark text-discord-light px-2 py-0.5 rounded-full">left</span>}
                  </div>
                  <div className="text-xs text-discord-light mt-0.5 flex gap-3">
                    <span>{guild.memberCount.toLocaleString()} members</span>
                    <span>ID: {guild.id}</span>
                    <span>Added {new Date(guild.addedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                {!guild.leftAt && (
                  <div className="flex items-center gap-2 shrink-0">
                    {guild.status === 'pending' && (
                      <button
                        onClick={() => approve.mutate(guild.id)}
                        disabled={approve.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 text-sm transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve
                      </button>
                    )}
                    {guild.status !== 'blacklisted' && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Blacklist "${guild.name}"? The bot will leave immediately.`)) {
                            blacklist.mutate(guild.id);
                          }
                        }}
                        disabled={blacklist.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        Blacklist
                      </button>
                    )}
                    {guild.status === 'approved' && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Leave "${guild.name}"? The server will stay approved.`)) {
                            leave.mutate(guild.id);
                          }
                        }}
                        disabled={leave.isPending}
                        className="p-1.5 rounded-lg text-discord-light hover:text-white hover:bg-discord-dark transition-colors"
                        title="Leave server"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add dashboard/frontend/src/pages/AdminPage.tsx
git commit -m "feat: add admin panel page with guild management"
```

---

### Task 7: Frontend — Wire Up Route, Nav Link, and Env Var

**Files:**
- Modify: `dashboard/frontend/src/App.tsx`
- Modify: `dashboard/frontend/src/components/Layout.tsx`
- Modify: `dashboard/frontend/.env` (if exists) or note that `VITE_BOT_OWNER_ID` must be set in production

**Step 1: Add admin route to `App.tsx`**

Add import at top with other page imports:
```typescript
import AdminPage from './pages/AdminPage';
```

Add route inside the `<Route path="/" element={<Layout />}>` block, after `<Route path="dashboard" ...>` and before the guild routes:
```typescript
<Route path="admin" element={<AdminPage />} />
```

**Step 2: Add admin link to `Layout.tsx`**

In `Layout.tsx`, the nav already imports `useAuth`. Add a conditional admin link in the nav bar. Import `useAuth` (already used), import `ShieldAlert` from lucide-react, then in the nav items area add after the Dashboard link:

```tsx
import { Bot, LogOut, LayoutDashboard, ShieldAlert } from 'lucide-react';

// Inside the nav, after the Dashboard Link:
{user && (import.meta.env.VITE_BOT_OWNER_ID || '').split(',').map((s: string) => s.trim()).includes(user.id) && (
  <Link
    to="/admin"
    className="flex items-center gap-2 text-discord-light hover:text-white transition-colors"
  >
    <ShieldAlert className="w-5 h-5" />
    Admin
  </Link>
)}
```

**Step 3: Check/update `dashboard/frontend/.env`**

The file at `dashboard/frontend/.env` (or `.env.local`) must have:
```
VITE_BOT_OWNER_ID=YOUR_DISCORD_USER_ID
```

Check if the file exists. If it doesn't, note in the commit message that it must be set on the VPS via the Docker build args or environment. Since Vite bakes env vars at build time, this must be set before `docker compose build`.

On the VPS the `.env` file is at `/opt/wall-e-bot/.env` — add `VITE_BOT_OWNER_ID` there and update `docker/Dockerfile.frontend` to pass it as a build arg.

Check `docker/Dockerfile.frontend`:

```bash
cat docker/Dockerfile.frontend
```

If it has a build stage with `npm run build` or `vite build`, add:
```dockerfile
ARG VITE_BOT_OWNER_ID
ENV VITE_BOT_OWNER_ID=$VITE_BOT_OWNER_ID
```
before the build command, and in `docker-compose.yml` under the frontend build section add:
```yaml
build:
  args:
    - VITE_BOT_OWNER_ID=${BOT_OWNER_ID}
```

This way `BOT_OWNER_ID` from `.env` flows through to the Vite build.

**Step 4: Commit**

```bash
git add dashboard/frontend/src/App.tsx dashboard/frontend/src/components/Layout.tsx
git commit -m "feat: wire up admin route and nav link, pass owner ID to Vite build"
```

---

### Task 8: Deploy

**Steps:**

1. Push all commits: `git push origin main`

2. On VPS, run migration to create `guild_whitelist` table:
   ```bash
   docker exec wall-e-backend node dist/db/migrate.js
   ```

3. Rebuild all containers:
   ```bash
   docker compose -f docker/docker-compose.yml up -d --build
   ```

4. Verify whitelist was seeded by checking:
   ```bash
   docker exec wall-e-postgres psql -U walle -d wall_e_bot -c "SELECT guild_id, guild_name, status FROM guild_whitelist;"
   ```

5. Verify admin page loads at `/admin` in the dashboard (must be logged in as the bot owner Discord account).
