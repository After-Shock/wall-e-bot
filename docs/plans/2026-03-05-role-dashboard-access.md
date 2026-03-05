# Role-Based Dashboard Access Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow server admins to grant any Discord role full dashboard access, so non-admin members (e.g. moderators) can manage the bot.

**Architecture:** New `dashboard_roles` DB table. `requireGuildAccess` middleware gains an async role-check fallback: if user lacks MANAGE_GUILD, fetch allowed role IDs from DB then call Discord API with bot token to check member roles. Guild list broadened to all mutual guilds (not just MANAGE_GUILD). New routes let admins manage the allowed-role list.

**Tech Stack:** Express + PostgreSQL + Discord REST API (bot token). React + TanStack Query.

---

### Task 1: DB — Add dashboard_roles table

**Files:**
- Modify: `dashboard/backend/src/db/migrate.ts`

**Step 1: Add the table definition**

Find the last line of the `schema` string (just before the closing backtick, around line 379 after the `cembed_response` line). Add:

```sql

-- Dashboard access roles (non-admin users who can access the dashboard)
CREATE TABLE IF NOT EXISTS dashboard_roles (
  guild_id VARCHAR(20) NOT NULL,
  role_id  VARCHAR(20) NOT NULL,
  PRIMARY KEY (guild_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_roles_guild ON dashboard_roles(guild_id);
```

**Step 2: TypeScript check**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p dashboard/backend/tsconfig.json
```

Expected: no errors.

**Step 3: Commit**

```bash
git add dashboard/backend/src/db/migrate.ts
git commit -m "feat: add dashboard_roles table migration"
```

---

### Task 2: Backend — Update requireGuildAccess + add requireGuildAdmin

**Files:**
- Modify: `dashboard/backend/src/middleware/auth.ts`

The current `requireGuildAccess` is synchronous and only checks MANAGE_GUILD. We need to:
1. Make it async (Express supports async middleware — errors propagate via `next(error)`)
2. Add a role-check fallback using the bot token
3. Add a new `requireGuildAdmin` middleware (MANAGE_GUILD only, no role fallback — used for routes that edit the access list itself)

**Step 1: Add db import at top of auth.ts**

Current line 1:
```typescript
import { Request, Response, NextFunction, RequestHandler } from 'express';
```

Replace with:
```typescript
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../db/index.js';
```

**Step 2: Replace requireGuildAccess with async version**

Find the entire `requireGuildAccess` block (lines 32–58) and replace it:

```typescript
export const requireGuildAccess: RequestHandler = async (req, res, next) => {
  try {
    const guildId = req.params.guildId;
    const user = (req as AuthenticatedRequest).user;

    if (!user || !user.guilds) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Fast path: user has MANAGE_GUILD / ADMINISTRATOR / is owner
    const guild = user.guilds.find(g => g.id === guildId);
    if (guild) {
      const permissions = BigInt(guild.permissions);
      const MANAGE_GUILD = BigInt(0x20);
      const ADMINISTRATOR = BigInt(0x8);
      if (
        guild.owner ||
        (permissions & MANAGE_GUILD) === MANAGE_GUILD ||
        (permissions & ADMINISTRATOR) === ADMINISTRATOR
      ) {
        next();
        return;
      }
    }

    // Slow path: check if guild has configured dashboard roles
    const rolesResult = await db.query(
      'SELECT role_id FROM dashboard_roles WHERE guild_id = $1',
      [guildId],
    );

    if (rolesResult.rows.length === 0) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    // Call Discord API with bot token to get user's guild member roles
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      res.status(500).json({ error: 'Bot token not configured' });
      return;
    }

    const memberResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${user.id}`,
      { headers: { Authorization: `Bot ${token}` } },
    );

    if (!memberResponse.ok) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const member = await memberResponse.json() as { roles: string[] };
    const allowedRoleIds = new Set<string>(rolesResult.rows.map((r: { role_id: string }) => r.role_id));
    const hasRole = member.roles.some(roleId => allowedRoleIds.has(roleId));

    if (!hasRole) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
```

**Step 3: Add requireGuildAdmin middleware**

Add this after `requireGuildAccess` (before `requireBotOwner`):

```typescript
// Like requireGuildAccess but only allows MANAGE_GUILD/ADMINISTRATOR/owner — no role fallback.
// Used for routes that edit the dashboard access list itself.
export const requireGuildAdmin: RequestHandler = (req, res, next) => {
  const guildId = req.params.guildId;
  const user = (req as AuthenticatedRequest).user;

  if (!user || !user.guilds) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const guild = user.guilds.find(g => g.id === guildId);
  if (!guild) {
    res.status(403).json({ error: 'No access to this guild' });
    return;
  }

  const permissions = BigInt(guild.permissions);
  const MANAGE_GUILD = BigInt(0x20);
  const ADMINISTRATOR = BigInt(0x8);

  if (
    !guild.owner &&
    (permissions & MANAGE_GUILD) !== MANAGE_GUILD &&
    (permissions & ADMINISTRATOR) !== ADMINISTRATOR
  ) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  next();
};
```

**Step 4: TypeScript check**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p dashboard/backend/tsconfig.json
```

Expected: no errors.

**Step 5: Commit**

```bash
git add dashboard/backend/src/middleware/auth.ts
git commit -m "feat: make requireGuildAccess async with role fallback, add requireGuildAdmin"
```

---

### Task 3: Backend — Dashboard roles routes + guild roles endpoint

**Files:**
- Create: `dashboard/backend/src/routes/dashboardRoles.ts`
- Modify: `dashboard/backend/src/index.ts`
- Modify: `dashboard/backend/src/routes/guilds.ts`

**Step 1: Create dashboardRoles.ts**

```typescript
import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess, requireGuildAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';

export const dashboardRolesRouter = Router({ mergeParams: true });

const DISCORD_API = 'https://discord.com/api/v10';

function botHeaders() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('Bot token not configured');
  return { Authorization: `Bot ${token}` };
}

// GET /api/guilds/:guildId/dashboard-roles
// Returns configured role IDs with names (fetched from Discord)
dashboardRolesRouter.get('/', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;

  const result = await db.query(
    'SELECT role_id FROM dashboard_roles WHERE guild_id = $1 ORDER BY role_id',
    [guildId],
  );

  if (result.rows.length === 0) {
    res.json([]);
    return;
  }

  // Fetch guild roles from Discord to get names
  let roleNameMap: Record<string, string> = {};
  try {
    const rolesRes = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, { headers: botHeaders() });
    if (rolesRes.ok) {
      const roles = await rolesRes.json() as { id: string; name: string }[];
      roleNameMap = Object.fromEntries(roles.map(r => [r.id, r.name]));
    }
  } catch {
    // Names will fall back to role ID
  }

  const rows = result.rows.map((r: { role_id: string }) => ({
    roleId: r.role_id,
    roleName: roleNameMap[r.role_id] ?? r.role_id,
  }));

  res.json(rows);
}));

// POST /api/guilds/:guildId/dashboard-roles
// Body: { roleId: string }
// Only admins (MANAGE_GUILD) can add roles — uses requireGuildAdmin, not requireGuildAccess
dashboardRolesRouter.post('/', requireAuth, requireGuildAdmin, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const { roleId } = req.body;

  if (!roleId || typeof roleId !== 'string' || !/^\d+$/.test(roleId)) {
    res.status(400).json({ error: 'Invalid roleId' });
    return;
  }

  await db.query(
    'INSERT INTO dashboard_roles (guild_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [guildId, roleId],
  );

  // Return updated list (same as GET handler logic)
  const result = await db.query(
    'SELECT role_id FROM dashboard_roles WHERE guild_id = $1 ORDER BY role_id',
    [guildId],
  );

  let roleNameMap: Record<string, string> = {};
  try {
    const rolesRes = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, { headers: botHeaders() });
    if (rolesRes.ok) {
      const roles = await rolesRes.json() as { id: string; name: string }[];
      roleNameMap = Object.fromEntries(roles.map(r => [r.id, r.name]));
    }
  } catch { /* ignore */ }

  res.json(result.rows.map((r: { role_id: string }) => ({
    roleId: r.role_id,
    roleName: roleNameMap[r.role_id] ?? r.role_id,
  })));
}));

// DELETE /api/guilds/:guildId/dashboard-roles/:roleId
dashboardRolesRouter.delete('/:roleId', requireAuth, requireGuildAdmin, asyncHandler(async (req, res) => {
  const { guildId, roleId } = req.params;

  await db.query(
    'DELETE FROM dashboard_roles WHERE guild_id = $1 AND role_id = $2',
    [guildId, roleId],
  );

  const result = await db.query(
    'SELECT role_id FROM dashboard_roles WHERE guild_id = $1 ORDER BY role_id',
    [guildId],
  );

  let roleNameMap: Record<string, string> = {};
  try {
    const rolesRes = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, { headers: botHeaders() });
    if (rolesRes.ok) {
      const roles = await rolesRes.json() as { id: string; name: string }[];
      roleNameMap = Object.fromEntries(roles.map(r => [r.id, r.name]));
    }
  } catch { /* ignore */ }

  res.json(result.rows.map((r: { role_id: string }) => ({
    roleId: r.role_id,
    roleName: roleNameMap[r.role_id] ?? r.role_id,
  })));
}));
```

**Step 2: Add guild roles endpoint to guilds.ts**

Add this route at the end of guilds.ts (before the final export, after all existing routes). This returns all guild roles from Discord for the "Add Role" dropdown:

```typescript
// GET /api/guilds/:guildId/roles — returns all guild roles (for dashboard access dropdown)
guildsRouter.get('/:guildId/roles', requireAuth, requireGuildAdmin, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'Bot token not configured' });
    return;
  }

  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!response.ok) {
      res.status(response.status).json({ error: 'Failed to fetch guild roles' });
      return;
    }

    const roles = await response.json() as { id: string; name: string; color: number; position: number }[];

    // Sort by position descending (highest roles first), exclude @everyone
    const sorted = roles
      .filter(r => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: r.color }));

    res.json(sorted);
  } catch (error) {
    logger.error('Error fetching guild roles:', error);
    res.status(500).json({ error: 'Failed to fetch guild roles' });
  }
}));
```

Also add `requireGuildAdmin` to the imports at the top of guilds.ts:

```typescript
import { requireAuth, requireGuildAccess, requireGuildAdmin, AuthenticatedRequest, AuthenticatedUser } from '../middleware/auth.js';
```

**Step 3: Register dashboardRolesRouter in index.ts**

Add import and mount after the commandGroups line:

```typescript
import { dashboardRolesRouter } from './routes/dashboardRoles.js';
```

```typescript
app.use('/api/guilds/:guildId/dashboard-roles', dashboardRolesRouter);
```

**Step 4: TypeScript check**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p dashboard/backend/tsconfig.json
```

Expected: no errors.

**Step 5: Commit**

```bash
git add dashboard/backend/src/routes/dashboardRoles.ts dashboard/backend/src/index.ts dashboard/backend/src/routes/guilds.ts
git commit -m "feat: add dashboard-roles CRUD routes and guild roles endpoint"
```

---

### Task 4: Backend — Broaden guild list to all mutual guilds

**Files:**
- Modify: `dashboard/backend/src/routes/guilds.ts`

Currently `GET /api/guilds` filters to guilds where the user has MANAGE_GUILD. Role-based users won't have MANAGE_GUILD but should still see the guild. Change it to return all mutual guilds (user is member + bot is present), adding `isAdmin: boolean` so the frontend can show the settings icon only for admins.

**Step 1: Update the GET / handler in guilds.ts**

Find the `guildsRouter.get('/'` handler (lines ~37–88). The change is minimal — replace `manageableGuilds` with all guilds (filtered to bot-present), and add `isAdmin` field.

Find this block:
```typescript
    // Filter to guilds where user has MANAGE_GUILD or is owner
    const manageableGuilds = guilds.filter((guild) => {
      const permissions = BigInt(guild.permissions);
      const MANAGE_GUILD = BigInt(0x20);
      const ADMINISTRATOR = BigInt(0x8);
      return guild.owner || (permissions & MANAGE_GUILD) === MANAGE_GUILD || (permissions & ADMINISTRATOR) === ADMINISTRATOR;
    });

    // Store guilds in session for permission checking
    (authReq.user as any).guilds = guilds;

    // Get bot's actual guilds from Discord API using the bot token
    const botGuildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
    });
    const botGuildIds = new Set<string>(
      botGuildsResponse.ok
        ? (await botGuildsResponse.json() as { id: string }[]).map(g => g.id)
        : [],
    );

    const guildsWithBotStatus = manageableGuilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      owner: guild.owner,
      botPresent: botGuildIds.has(guild.id),
    }));

    res.json(guildsWithBotStatus);
```

Replace with:
```typescript
    // Store guilds in session for permission checking (all guilds, needed by requireGuildAccess)
    (authReq.user as any).guilds = guilds;

    // Get bot's guilds from Discord API
    const botGuildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
    });
    const botGuildIds = new Set<string>(
      botGuildsResponse.ok
        ? (await botGuildsResponse.json() as { id: string }[]).map(g => g.id)
        : [],
    );

    // Return all guilds where the bot is present (mutual guilds), with isAdmin flag
    const MANAGE_GUILD = BigInt(0x20);
    const ADMINISTRATOR = BigInt(0x8);

    const guildsWithBotStatus = guilds
      .filter(guild => botGuildIds.has(guild.id))
      .map((guild) => {
        const permissions = BigInt(guild.permissions);
        const isAdmin = guild.owner ||
          (permissions & MANAGE_GUILD) === MANAGE_GUILD ||
          (permissions & ADMINISTRATOR) === ADMINISTRATOR;
        return {
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          owner: guild.owner,
          botPresent: true,
          isAdmin,
        };
      });

    res.json(guildsWithBotStatus);
```

**Step 2: TypeScript check**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p dashboard/backend/tsconfig.json
```

**Step 3: Commit**

```bash
git add dashboard/backend/src/routes/guilds.ts
git commit -m "feat: broaden guild list to all mutual guilds, add isAdmin flag"
```

---

### Task 5: Frontend — Dashboard Access settings card + guild list update

**Files:**
- Modify: `dashboard/frontend/src/pages/GuildPage.tsx`
- Modify: `dashboard/frontend/src/pages/DashboardPage.tsx`

**Step 1: Update Guild interface in DashboardPage.tsx**

Add `isAdmin: boolean` to the `Guild` interface:

```typescript
interface Guild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  botPresent: boolean;
  isAdmin: boolean;
}
```

The guild list currently shows "Add Bot" for non-botPresent guilds, but we're now only returning botPresent guilds. The "Add Bot" card shows if `!guild.botPresent` — that will never render now, which is fine. No other change needed in DashboardPage.tsx.

**Step 2: Add DashboardAccessTab component to GuildPage.tsx**

Add the following component after the `CustomizationTab` function (around line 390, before the closing of the file):

```tsx
// ─── Dashboard Access Tab ─────────────────────────────────────────────────────

interface DashboardRole {
  roleId: string;
  roleName: string;
}

interface GuildRole {
  id: string;
  name: string;
  color: number;
}

function DashboardAccessTab({ guildId }: { guildId: string }) {
  const queryClient = useQueryClient();
  const [addingRoleId, setAddingRoleId] = useState('');

  const { data: configuredRoles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['dashboard-roles', guildId],
    queryFn: async () => {
      const r = await api.get<DashboardRole[]>(`/api/guilds/${guildId}/dashboard-roles`);
      return r.data;
    },
  });

  const { data: guildRoles = [] } = useQuery({
    queryKey: ['guild-roles', guildId],
    queryFn: async () => {
      const r = await api.get<GuildRole[]>(`/api/guilds/${guildId}/roles`);
      return r.data;
    },
  });

  const addMutation = useMutation({
    mutationFn: (roleId: string) => api.post(`/api/guilds/${guildId}/dashboard-roles`, { roleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-roles', guildId] });
      setAddingRoleId('');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (roleId: string) => api.delete(`/api/guilds/${guildId}/dashboard-roles/${roleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-roles', guildId] });
    },
  });

  const configuredIds = new Set(configuredRoles.map(r => r.roleId));
  const availableRoles = guildRoles.filter(r => !configuredIds.has(r.id));

  function roleColor(color: number): string {
    return color === 0 ? '#b5bac1' : '#' + color.toString(16).padStart(6, '0');
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Dashboard Access</h2>
      <p className="text-discord-light text-sm mb-6">
        Members with these roles can access this server's dashboard with full permissions.
      </p>

      {rolesLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-discord-light" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Configured roles list */}
          {configuredRoles.length === 0 ? (
            <p className="text-discord-light text-sm">
              No roles configured. Only server admins can access the dashboard.
            </p>
          ) : (
            <div className="space-y-2">
              {configuredRoles.map(role => (
                <div key={role.roleId} className="flex items-center justify-between p-3 bg-discord-darker rounded-lg">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: roleColor(guildRoles.find(r => r.id === role.roleId)?.color ?? 0) }}
                    />
                    <span className="text-sm font-medium">{role.roleName}</span>
                  </div>
                  <button
                    onClick={() => removeMutation.mutate(role.roleId)}
                    disabled={removeMutation.isPending}
                    className="text-red-400 hover:text-red-300 text-sm transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add role */}
          {availableRoles.length > 0 && (
            <div className="flex items-center gap-3 pt-2">
              <select
                value={addingRoleId}
                onChange={e => setAddingRoleId(e.target.value)}
                className="input flex-1 max-w-xs"
              >
                <option value="">Select a role…</option>
                {availableRoles.map(role => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
              <button
                onClick={() => addingRoleId && addMutation.mutate(addingRoleId)}
                disabled={!addingRoleId || addMutation.isPending}
                className="btn btn-primary flex items-center gap-2 shrink-0"
              >
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Add Role
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Add "Access" tab to GuildPage.tsx**

The `GuildPage` component passes `isAdmin` from the guild query result to decide whether to show the Dashboard Access tab. But the guild config query (`/api/guilds/:guildId`) doesn't return `isAdmin`. We need to get it from the guild list.

The cleanest approach: add a query for the user's guilds and find the current guild's `isAdmin` flag. Or, simply always render the tab (role-based users who try to load it will get a 403 from the backend and the tab can show an error). Since the `GET /api/guilds/:guildId/dashboard-roles` route uses `requireGuildAccess` (allows role-based), and the add/remove routes use `requireGuildAdmin`, the backend enforces the distinction.

Add "Access" to the tabs array and render `DashboardAccessTab`:

Find:
```tsx
  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'moderation', label: 'Moderation', icon: Shield },
    { id: 'leveling', label: 'Leveling', icon: Star },
    { id: 'welcome', label: 'Welcome', icon: MessageSquare },
    { id: 'customization', label: 'Customization', icon: Bot },
  ];
```

Replace with:
```tsx
  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'moderation', label: 'Moderation', icon: Shield },
    { id: 'leveling', label: 'Leveling', icon: Star },
    { id: 'welcome', label: 'Welcome', icon: MessageSquare },
    { id: 'customization', label: 'Customization', icon: Bot },
    { id: 'access', label: 'Access', icon: Shield },
  ];
```

Find the `{activeTab === 'customization' && (` block:
```tsx
            {activeTab === 'customization' && (
              <CustomizationTab guildId={guildId!} />
            )}
```

Add after it:
```tsx
            {activeTab === 'access' && (
              <DashboardAccessTab guildId={guildId!} />
            )}
```

**Step 4: Add useMutation import check**

GuildPage.tsx already imports `useQuery, useMutation, useQueryClient` from `@tanstack/react-query`. Verify `useMutation` is in the import. Also verify `Loader2` is imported from `lucide-react`. Both are already present in the existing file.

**Step 5: TypeScript check**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p dashboard/frontend/tsconfig.json
```

Expected: no errors. Fix any issues found (likely missing imports).

**Step 6: Commit**

```bash
git add dashboard/frontend/src/pages/GuildPage.tsx dashboard/frontend/src/pages/DashboardPage.tsx
git commit -m "feat: add Dashboard Access settings tab for role-based dashboard access"
```

---

### Task 6: Deploy

**Step 1: Push**

```bash
git push origin main
```

**Step 2: Deploy to VPS**

SSH to 107.174.93.143 (user: root, password: 5Ho7ebArVrXlMA9629) and run:

```bash
cd /opt/wall-e-bot && git pull && docker compose -f docker/docker-compose.yml build --no-cache && docker compose -f docker/docker-compose.yml up -d && docker compose -f docker/docker-compose.yml exec backend node dist/db/migrate.js
```

**Step 3: Verify**

1. Log into the dashboard
2. Navigate to a server's Settings → Access tab
3. Add a role — should appear in the list
4. Log in as a user with that role and confirm they can access the guild dashboard
5. Confirm that user cannot add/remove roles from the Access tab (gets 403)
