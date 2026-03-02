# Guild Settings Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Copy Settings From Another Server" feature to the dashboard so users can replicate a guild's configuration to another guild in one click.

**Architecture:** A new backend endpoint validates dual guild access then deep-clones and strips server-specific IDs from the source config before writing it to the target. A new `SyncPage` in the frontend lets the user pick a source guild and trigger the copy. The `stripServerIds` utility lives in `shared/` so it can be tested with the existing Jest setup.

**Tech Stack:** TypeScript, Express (backend), React + TanStack Query (frontend), PostgreSQL (existing), `@wall-e/shared` workspace package

---

### Task 1: Implement `stripServerIds` utility in shared

The config object contains Discord channel/role IDs (e.g. `modLogChannelId`, `channelId`, `muteRoleId`) that are invalid in a different guild. This utility recursively nulls any key that ends with `ChannelId` or `RoleId`.

**Files:**
- Create: `shared/src/utils/stripServerIds.ts`
- Modify: `shared/src/utils/index.ts` (re-export)
- Modify: `shared/src/index.ts` (check if utils already exported)

**Step 1: Write the failing test**

Create `bot/tests/utils/stripServerIds.test.ts`:

```typescript
import { stripServerIds } from '@wall-e/shared';

describe('stripServerIds', () => {
  it('nulls top-level channelId and roleId keys', () => {
    const config = {
      channelId: '111',
      muteRoleId: '222',
      prefix: '!',
    };
    const result = stripServerIds(config);
    expect(result.channelId).toBeNull();
    expect(result.muteRoleId).toBeNull();
    expect(result.prefix).toBe('!');
  });

  it('nulls nested channelId and roleId keys', () => {
    const config = {
      moderation: {
        modLogChannelId: '333',
        muteRoleId: '444',
        autoDeleteModCommands: true,
      },
      welcome: {
        channelId: '555',
        message: 'Hello!',
      },
    };
    const result = stripServerIds(config);
    expect(result.moderation.modLogChannelId).toBeNull();
    expect(result.moderation.muteRoleId).toBeNull();
    expect(result.moderation.autoDeleteModCommands).toBe(true);
    expect(result.welcome.channelId).toBeNull();
    expect(result.welcome.message).toBe('Hello!');
  });

  it('handles arrays by processing each element', () => {
    const config = {
      roles: [{ roleId: '777', name: 'Admin' }],
    };
    const result = stripServerIds(config);
    expect(result.roles[0].roleId).toBeNull();
    expect(result.roles[0].name).toBe('Admin');
  });

  it('returns a new object without mutating the original', () => {
    const config = { channelId: '111' };
    const result = stripServerIds(config);
    expect(config.channelId).toBe('111'); // original unchanged
    expect(result.channelId).toBeNull();
  });

  it('handles null and undefined values gracefully', () => {
    const config = { channelId: null, roleId: undefined, prefix: '!' };
    const result = stripServerIds(config as any);
    expect(result.prefix).toBe('!');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /home/plex/wall-e-bot && npm test -w bot -- --testPathPattern=stripServerIds
```

Expected: FAIL — `stripServerIds` is not exported from `@wall-e/shared`

**Step 3: Create the utility**

Create `shared/src/utils/stripServerIds.ts`:

```typescript
/**
 * Recursively strips server-specific Discord IDs from a guild config object.
 *
 * Any key ending with 'ChannelId' or 'RoleId' (case-insensitive) is set to null.
 * This prevents invalid references when copying a config to a different guild.
 */
export function stripServerIds<T extends object>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      item && typeof item === 'object' ? stripServerIds(item) : item
    ) as unknown as T;
  }

  const result = {} as T;

  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (/channelid$|roleid$/i.test(key as string)) {
      result[key] = null as unknown as T[keyof T];
    } else if (value && typeof value === 'object') {
      result[key] = stripServerIds(value as object) as T[keyof T];
    } else {
      result[key] = value;
    }
  }

  return result;
}
```

**Step 4: Export from shared**

Check `shared/src/utils/index.ts` (create if missing):

```typescript
export { stripServerIds } from './stripServerIds.js';
```

Then check `shared/src/index.ts` exports utils — add if not present:
```typescript
export * from './utils/index.js';
```

**Step 5: Run tests to verify they pass**

```bash
cd /home/plex/wall-e-bot && npm test -w bot -- --testPathPattern=stripServerIds
```

Expected: All 5 tests PASS

**Step 6: Commit**

```bash
cd /home/plex/wall-e-bot
git add shared/src/utils/stripServerIds.ts shared/src/utils/index.ts shared/src/index.ts bot/tests/utils/stripServerIds.test.ts
git commit -m "feat: add stripServerIds utility to shared package"
```

---

### Task 2: Add copy endpoint to backend

**Files:**
- Modify: `dashboard/backend/src/routes/guilds.ts` (add new route near the end, before module.exports)

**Step 1: Understand the auth pattern**

The `requireGuildAccess` middleware (in `dashboard/backend/src/middleware/auth.ts`) checks that the user has MANAGE_GUILD or owner access to `req.params.guildId`. It reads from `req.user.guilds` which is populated during OAuth.

For the copy endpoint, we need to check access to BOTH guilds. `requireGuildAccess` covers the target (it uses `req.params.guildId` which maps to `:targetGuildId`). We inline-check the source guild.

**Step 2: Add the helper function at the top of the route file**

Open `dashboard/backend/src/routes/guilds.ts`. After the existing imports, add a helper inline (inside the route handler, not as a module-level export):

```typescript
// Helper: check if user has manage access to a guild
function userHasGuildAccess(user: AuthenticatedUser, guildId: string): boolean {
  if (!user.guilds) return false;
  const guild = user.guilds.find(g => g.id === guildId);
  if (!guild) return false;
  const permissions = BigInt(guild.permissions);
  const MANAGE_GUILD = BigInt(0x20);
  const ADMINISTRATOR = BigInt(0x8);
  return guild.owner ||
    (permissions & MANAGE_GUILD) === MANAGE_GUILD ||
    (permissions & ADMINISTRATOR) === ADMINISTRATOR;
}
```

Also add the import for `stripServerIds` at the top of the file:
```typescript
import { stripServerIds } from '@wall-e/shared';
```

And import `AuthenticatedUser` from the auth middleware:
```typescript
import { requireAuth, requireGuildAccess, AuthenticatedRequest, AuthenticatedUser } from '../middleware/auth.js';
```

(Check the existing import — `AuthenticatedUser` may not yet be exported. If not, export it from `auth.ts`.)

**Step 3: Add the route**

At the end of `guilds.ts`, before any `export` statements, add:

```typescript
// Copy settings from one guild to another
guildsRouter.post(
  '/:guildId/copy-from/:sourceGuildId',
  requireAuth,
  requireGuildAccess,  // checks :guildId (target)
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const targetGuildId = req.params.guildId;
    const { sourceGuildId } = req.params;

    // Guard: same guild
    if (targetGuildId === sourceGuildId) {
      res.status(400).json({ error: 'Cannot copy settings to the same server' });
      return;
    }

    // Guard: user must also have access to source guild
    if (!userHasGuildAccess(authReq.user!, sourceGuildId)) {
      res.status(403).json({ error: "You don't have permission to access the source server" });
      return;
    }

    // Fetch source config
    const sourceResult = await db.query(
      'SELECT config FROM guild_configs WHERE guild_id = $1',
      [sourceGuildId]
    );

    if (sourceResult.rows.length === 0) {
      res.status(404).json({ error: 'Source server has no configuration' });
      return;
    }

    const sourceConfig = sourceResult.rows[0].config;

    // Strip server-specific IDs
    const cleanedConfig = stripServerIds(sourceConfig);

    // Upsert to target guild
    await db.query(
      `INSERT INTO guild_configs (guild_id, config, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (guild_id)
       DO UPDATE SET config = $2, updated_at = NOW()`,
      [targetGuildId, JSON.stringify(cleanedConfig)]
    );

    logger.info(`Guild config copied from ${sourceGuildId} to ${targetGuildId}`);
    res.json({ success: true, config: cleanedConfig });
  })
);
```

**Step 4: Check that `AuthenticatedUser` is exported from auth.ts**

Open `dashboard/backend/src/middleware/auth.ts`. If `AuthenticatedUser` is not already exported (it's an `export interface`), verify it is. The current file shows `export interface AuthenticatedUser` — good, it's already exported.

Update the import in `guilds.ts` to include `AuthenticatedUser`:
```typescript
import { requireAuth, requireGuildAccess, AuthenticatedRequest, AuthenticatedUser } from '../middleware/auth.js';
```

**Step 5: Build backend to check for TypeScript errors**

```bash
cd /home/plex/wall-e-bot && npm run build:backend
```

Expected: Build succeeds with no errors.

**Step 6: Commit**

```bash
cd /home/plex/wall-e-bot
git add dashboard/backend/src/routes/guilds.ts
git commit -m "feat: add POST /guilds/:guildId/copy-from/:sourceGuildId endpoint"
```

---

### Task 3: Create the `SyncPage` frontend component

**Files:**
- Create: `dashboard/frontend/src/pages/guild/SyncPage.tsx`

**Step 1: Review patterns from a similar page**

Quickly skim `dashboard/frontend/src/pages/guild/BackupPage.tsx` for:
- How `useParams` extracts `guildId`
- How `useMutation` + `api` calls are structured
- The CSS class patterns used (`card`, `btn`, `btn-primary`, etc.)

**Step 2: Create `SyncPage.tsx`**

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { api } from '../../services/api';

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  botPresent: boolean;
}

export default function SyncPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Reuse the existing guilds list from the dashboard
  const { data: guilds, isLoading } = useQuery<Guild[]>({
    queryKey: ['guilds'],
    queryFn: async () => {
      const response = await api.get<Guild[]>('/api/guilds');
      return response.data;
    },
  });

  // Other guilds where the bot is present (excluding current guild)
  const eligibleSources = guilds?.filter(
    (g) => g.id !== guildId && g.botPresent
  ) ?? [];

  const copyMutation = useMutation({
    mutationFn: async (sourceGuildId: string) => {
      const response = await api.post(
        `/api/guilds/${guildId}/copy-from/${sourceGuildId}`
      );
      return response.data;
    },
    onSuccess: (_, sourceGuildId) => {
      const sourceName = guilds?.find((g) => g.id === sourceGuildId)?.name ?? sourceGuildId;
      setSuccessMessage(`Settings copied from "${sourceName}" successfully. Reconfigure any channel and role assignments.`);
      setErrorMessage('');
      setSelectedSourceId('');
      // Invalidate guild config so other pages reflect new settings
      queryClient.invalidateQueries({ queryKey: ['guild', guildId] });
    },
    onError: (error: any) => {
      setErrorMessage(error?.response?.data?.error ?? 'Failed to copy settings. Please try again.');
      setSuccessMessage('');
    },
  });

  const handleCopy = () => {
    if (!selectedSourceId) return;
    setSuccessMessage('');
    setErrorMessage('');
    copyMutation.mutate(selectedSourceId);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RefreshCw className="w-6 h-6" />
          Sync Settings
        </h1>
        <p className="text-discord-light mt-1">
          Copy all settings from another server to this one to save setup time.
        </p>
      </div>

      {successMessage && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400">
          <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm">{errorMessage}</p>
        </div>
      )}

      <div className="card space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Copy className="w-5 h-5" />
          Copy From Another Server
        </h2>

        {isLoading ? (
          <div className="flex items-center gap-2 text-discord-light">
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-discord-blurple" />
            <span className="text-sm">Loading servers...</span>
          </div>
        ) : eligibleSources.length === 0 ? (
          <p className="text-discord-light text-sm">
            No other servers found where the bot is active. Add the bot to another server first.
          </p>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">
                Copy settings from:
              </label>
              <select
                className="w-full bg-discord-dark border border-discord-darker rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-discord-blurple"
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
              >
                <option value="">— Select a server —</option>
                {eligibleSources.map((guild) => (
                  <option key={guild.id} value={guild.id}>
                    {guild.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-sm text-yellow-300">
                <strong>Warning:</strong> This will overwrite <em>all</em> current settings on this server.
                Channel and role assignments will be cleared and must be reconfigured after copying.
              </p>
            </div>

            <button
              className="btn btn-primary flex items-center gap-2"
              disabled={!selectedSourceId || copyMutation.isPending}
              onClick={handleCopy}
            >
              {copyMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white" />
                  Copying...
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Settings
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Build frontend to check for TypeScript errors**

```bash
cd /home/plex/wall-e-bot && npm run build:frontend
```

Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
cd /home/plex/wall-e-bot
git add dashboard/frontend/src/pages/guild/SyncPage.tsx
git commit -m "feat: add SyncPage for copying guild settings"
```

---

### Task 4: Wire up routing and sidebar navigation

**Files:**
- Modify: `dashboard/frontend/src/App.tsx`
- Modify: `dashboard/frontend/src/components/Sidebar.tsx`

**Step 1: Add route to `App.tsx`**

Open `App.tsx`. Find the backup route:
```tsx
{/* Backup & Restore (Premium) */}
<Route path="backup" element={<BackupPage />} />
```

Add the sync import at the top with other guild imports:
```tsx
import SyncPage from './pages/guild/SyncPage';
```

Add the route directly after the backup route:
```tsx
{/* Sync Settings */}
<Route path="sync" element={<SyncPage />} />
```

**Step 2: Add nav item to `Sidebar.tsx`**

Open `Sidebar.tsx`. Find the import block and add `RefreshCw` to the lucide-react imports.

Find the `Settings` nav item near the bottom of `getNavItems`:
```typescript
{
  name: 'Settings',
  href: `/dashboard/${guildId}/settings`,
  icon: Settings,
},
```

Add the Sync item before Settings:
```typescript
{
  name: 'Sync Settings',
  href: `/dashboard/${guildId}/sync`,
  icon: RefreshCw,
},
{
  name: 'Settings',
  href: `/dashboard/${guildId}/settings`,
  icon: Settings,
},
```

**Step 3: Build to verify no errors**

```bash
cd /home/plex/wall-e-bot && npm run build:frontend
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
cd /home/plex/wall-e-bot
git add dashboard/frontend/src/App.tsx dashboard/frontend/src/components/Sidebar.tsx
git commit -m "feat: add Sync Settings route and sidebar nav item"
```

---

### Task 5: Run full test suite and verify

**Step 1: Run all tests**

```bash
cd /home/plex/wall-e-bot && npm test -w bot
```

Expected: All existing tests pass, plus the 5 new `stripServerIds` tests.

**Step 2: Build everything**

```bash
cd /home/plex/wall-e-bot && npm run build
```

Expected: All packages build successfully.

**Step 3: Manual verification checklist**

If running locally (`npm run dev`):
1. Navigate to any guild in the dashboard
2. Confirm "Sync Settings" appears in the sidebar
3. Go to `/dashboard/:guildId/sync`
4. Verify the page loads and shows guild dropdown (or "no other servers" message)
5. If you have two guilds: select source, click Copy, confirm success message appears

**Step 4: Final commit if any cleanup needed**

```bash
git add -p  # stage any remaining changes
git commit -m "chore: cleanup after sync feature implementation"
```
