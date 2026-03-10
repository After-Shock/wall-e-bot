# Hidden Nav Items Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let each dashboard user hide sidebar nav items they don't use, persisted per-user in the database.

**Architecture:** Add a `preferences JSONB` column to `users`, expose GET/PATCH `/api/me/preferences` in the backend, and update `Sidebar.tsx` to filter nav items and provide an edit-mode UI for hiding/restoring them.

**Tech Stack:** PostgreSQL (JSONB), Express + TypeScript (backend), React + TanStack Query + lucide-react (frontend)

---

### Task 1: DB migration — add preferences column to users

**Files:**
- Modify: `dashboard/backend/src/db/migrate.ts` (append to the `schema` string, before the closing backtick on line 426)

**Step 1: Add the migration line**

Inside the `schema` template literal at the very end (after the `ALTER TABLE ticket_panels DROP COLUMN IF EXISTS stack_group;` line, before the closing backtick), add:

```sql
-- User preferences (hidden nav items, etc.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}';
```

**Step 2: Run the migration locally to verify it applies cleanly**

```bash
cd /home/plex/wall-e-bot
node_modules/.bin/ts-node -e "require('dotenv').config(); require('./dashboard/backend/src/db/migrate.ts')"
```

Or if using compiled JS (production pattern):

```bash
cd /home/plex/wall-e-bot
node_modules/.bin/tsc -p dashboard/backend/tsconfig.json && node dist/db/migrate.js
```

Expected output: `Migrations completed successfully!`

**Step 3: Verify column exists**

Connect to the DB and run: `\d users` — confirm `preferences jsonb` column is present with default `'{}'`.

**Step 4: Commit**

```bash
git add dashboard/backend/src/db/migrate.ts
git commit -m "feat: add preferences JSONB column to users"
```

---

### Task 2: Backend — GET/PATCH /api/me/preferences

**Files:**
- Modify: `dashboard/backend/src/routes/users.ts`

**Context:** The file already has `GET /me` and `GET /me/stats` handlers following this exact pattern:
- `requireAuth` middleware
- `asyncHandler` wrapper
- `const authReq = req as AuthenticatedRequest`
- Query by `authReq.user!.id` (which is the Discord ID, matching `discord_id` column)

**Step 1: Add GET /me/preferences**

After the existing `usersRouter.get('/me/stats', ...)` handler (after line 55), add:

```typescript
// Get user preferences
usersRouter.get('/me/preferences', requireAuth, asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const result = await db.query(
    'SELECT preferences FROM users WHERE discord_id = $1',
    [authReq.user!.id],
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(result.rows[0].preferences);
}));
```

**Step 2: Add PATCH /me/preferences**

Immediately after the GET handler:

```typescript
// Update user preferences (partial merge)
usersRouter.patch('/me/preferences', requireAuth, asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { hidden_nav } = req.body as { hidden_nav?: string[] };

  if (!Array.isArray(hidden_nav) || !hidden_nav.every(x => typeof x === 'string')) {
    res.status(400).json({ error: 'hidden_nav must be an array of strings' });
    return;
  }

  const result = await db.query(
    `UPDATE users
     SET preferences = preferences || $1::jsonb, updated_at = NOW()
     WHERE discord_id = $2
     RETURNING preferences`,
    [JSON.stringify({ hidden_nav }), authReq.user!.id],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(result.rows[0].preferences);
}));
```

> **Note on the SQL:** `preferences || $1::jsonb` is a JSONB merge — it overwrites the `hidden_nav` key while preserving any other keys in `preferences`. This is the correct pattern for partial updates of JSONB in PostgreSQL.

**Step 3: Build and verify**

```bash
cd /home/plex/wall-e-bot
node_modules/.bin/tsc -p dashboard/backend/tsconfig.json --noEmit
```

Expected: no TypeScript errors.

**Step 4: Manual smoke test**

Start the backend locally (or use the running instance). With a valid session cookie:

```bash
# Get preferences (should return {})
curl -s http://localhost:3001/api/me/preferences -H "Cookie: <session>"

# Set hidden_nav
curl -s -X PATCH http://localhost:3001/api/me/preferences \
  -H "Cookie: <session>" \
  -H "Content-Type: application/json" \
  -d '{"hidden_nav": ["Starboard"]}'
# Expected: {"hidden_nav":["Starboard"]}

# Verify persisted
curl -s http://localhost:3001/api/me/preferences -H "Cookie: <session>"
# Expected: {"hidden_nav":["Starboard"]}
```

**Step 5: Commit**

```bash
git add dashboard/backend/src/routes/users.ts
git commit -m "feat: add GET/PATCH /api/me/preferences endpoints"
```

---

### Task 3: Frontend — preferences API + Sidebar edit mode

**Files:**
- Modify: `dashboard/frontend/src/services/api.ts`
- Modify: `dashboard/frontend/src/components/Sidebar.tsx`

#### Part A: api.ts

**Step 1: Add a `preferencesApi` export at the bottom of `api.ts`**

After the closing `};` of `ticketApi`, add:

```typescript
// ─── Preferences API ──────────────────────────────────────────────────────────

export const preferencesApi = {
  get: () =>
    api.get<{ hidden_nav: string[] }>('/api/me/preferences').then(r => r.data),

  update: (data: { hidden_nav: string[] }) =>
    api.patch<{ hidden_nav: string[] }>('/api/me/preferences', data).then(r => r.data),
};
```

#### Part B: Sidebar.tsx

This is the main change. Here's the full updated file — replace `Sidebar.tsx` entirely:

**Imports to add:** `Eye`, `EyeOff`, `Pencil` from lucide-react; `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query`; `preferencesApi` from `../services/api`.

**Key changes:**
1. Add `editMode` state to `Sidebar`
2. Fetch preferences with `useQuery(['me-preferences'], preferencesApi.get)`
3. Mutate with `useMutation(preferencesApi.update)` + optimistic update
4. Filter `navItems` by `hidden_nav` in normal mode
5. In edit mode: show all items with hide button; show "Hidden" section with restore buttons

Here is the complete replacement for `Sidebar.tsx`:

```typescript
import { NavLink, useParams } from 'react-router-dom';
import {
  Home,
  MessageSquare,
  Shield,
  ShieldAlert,
  ScrollText,
  Smile,
  Terminal,
  Star,
  TrendingUp,
  Bell,
  Clock,
  Zap,
  Palette,
  Lightbulb,
  BarChart3,
  Users,
  Settings,
  ChevronDown,
  ChevronRight,
  Database,
  Crown,
  RefreshCw,
  Trash2,
  X,
  Pencil,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useState, createContext, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { preferencesApi } from '../services/api';

const OnCloseContext = createContext<(() => void) | undefined>(undefined);

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  children?: NavItem[];
}

const getNavItems = (guildId: string): NavItem[] => [
  {
    name: 'Overview',
    href: `/dashboard/${guildId}`,
    icon: Home,
  },
  {
    name: 'Analytics',
    href: `/dashboard/${guildId}/analytics`,
    icon: BarChart3,
  },
  {
    name: 'Welcome',
    href: `/dashboard/${guildId}/welcome`,
    icon: MessageSquare,
    children: [
      { name: 'Welcome Messages', href: `/dashboard/${guildId}/welcome/messages`, icon: MessageSquare },
      { name: 'Auto Roles', href: `/dashboard/${guildId}/welcome/autoroles`, icon: Users },
      { name: 'Server Rules', href: `/dashboard/${guildId}/welcome/rules`, icon: ScrollText },
    ],
  },
  {
    name: 'Moderation',
    href: `/dashboard/${guildId}/moderation`,
    icon: Shield,
    children: [
      { name: 'Mod Actions', href: `/dashboard/${guildId}/moderation/actions`, icon: Shield },
      { name: 'Warnings', href: `/dashboard/${guildId}/moderation/warnings`, icon: ShieldAlert },
      { name: 'Temp Bans', href: `/dashboard/${guildId}/moderation/tempbans`, icon: Clock },
      { name: 'Auto-Delete', href: `/dashboard/${guildId}/moderation/auto-delete`, icon: Trash2 },
    ],
  },
  {
    name: 'Auto-Mod',
    href: `/dashboard/${guildId}/automod`,
    icon: ShieldAlert,
    children: [
      { name: 'Spam Protection', href: `/dashboard/${guildId}/automod/spam`, icon: ShieldAlert },
      { name: 'Word Filters', href: `/dashboard/${guildId}/automod/filters`, icon: Terminal },
      { name: 'Link Protection', href: `/dashboard/${guildId}/automod/links`, icon: Zap },
      { name: 'Advanced AI', href: `/dashboard/${guildId}/automod/advanced`, icon: Crown },
    ],
  },
  {
    name: 'Logging',
    href: `/dashboard/${guildId}/logging`,
    icon: ScrollText,
  },
  {
    name: 'Reaction Roles',
    href: `/dashboard/${guildId}/reaction-roles`,
    icon: Smile,
  },
  {
    name: 'Custom Commands',
    href: `/dashboard/${guildId}/commands`,
    icon: Terminal,
  },
  {
    name: 'Starboard',
    href: `/dashboard/${guildId}/starboard`,
    icon: Star,
  },
  {
    name: 'Leveling',
    href: `/dashboard/${guildId}/leveling`,
    icon: TrendingUp,
    children: [
      { name: 'Settings', href: `/dashboard/${guildId}/leveling/settings`, icon: Settings },
      { name: 'Role Rewards', href: `/dashboard/${guildId}/leveling/rewards`, icon: Star },
      { name: 'Leaderboard', href: `/dashboard/${guildId}/leveling/leaderboard`, icon: BarChart3 },
    ],
  },
  {
    name: 'Announcements',
    href: `/dashboard/${guildId}/announcements`,
    icon: Bell,
    children: [
      { name: 'Scheduled Messages', href: `/dashboard/${guildId}/announcements/scheduled`, icon: Clock },
      { name: 'Twitch Alerts', href: `/dashboard/${guildId}/announcements/twitch`, icon: Zap },
      { name: 'Auto Feeds', href: `/dashboard/${guildId}/announcements/feeds`, icon: Bell },
    ],
  },
  {
    name: 'Triggers',
    href: `/dashboard/${guildId}/triggers`,
    icon: Zap,
  },
  {
    name: 'Embeds',
    href: `/dashboard/${guildId}/embeds`,
    icon: Palette,
  },
  {
    name: 'Suggestions',
    href: `/dashboard/${guildId}/suggestions`,
    icon: Lightbulb,
  },
  {
    name: 'Tickets',
    href: `/dashboard/${guildId}/tickets`,
    icon: MessageSquare,
  },
  {
    name: 'Backup & Restore',
    href: `/dashboard/${guildId}/backup`,
    icon: Database,
  },
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
];

interface NavItemComponentProps {
  item: NavItem;
  depth?: number;
  editMode?: boolean;
  isHidden?: boolean;
  onToggleHide?: (name: string) => void;
}

function NavItemComponent({ item, depth = 0, editMode = false, isHidden = false, onToggleHide }: NavItemComponentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const onClose = useContext(OnCloseContext);

  const baseClasses = `
    flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
    text-discord-light hover:text-white hover:bg-discord-dark
  `;

  const activeClasses = `
    bg-discord-blurple/20 text-white border-l-2 border-discord-blurple
  `;

  const hiddenClasses = `opacity-50`;

  if (hasChildren && !isHidden) {
    return (
      <div className={editMode ? hiddenClasses : ''}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={`${baseClasses} flex-1 justify-between`}
            style={{ paddingLeft: `${12 + depth * 12}px` }}
          >
            <div className="flex items-center gap-3">
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">{item.name}</span>
            </div>
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {editMode && onToggleHide && (
            <button
              onClick={() => onToggleHide(item.name)}
              className="p-1.5 text-discord-light hover:text-white shrink-0"
              title="Hide item"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          )}
        </div>
        {isOpen && (
          <div className="ml-2 mt-1 space-y-1">
            {item.children!.map((child) => (
              <NavItemComponent key={child.href} item={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${isHidden ? hiddenClasses : ''}`}>
      <NavLink
        to={item.href}
        end={item.href.split('/').length <= 4}
        onClick={onClose}
        className={({ isActive }) =>
          `${baseClasses} flex-1 ${isActive ? activeClasses : ''}`
        }
        style={{ paddingLeft: `${12 + depth * 12}px` }}
      >
        <item.icon className="w-5 h-5 shrink-0" />
        <span className="text-sm font-medium">{item.name}</span>
        {item.badge && (
          <span className="ml-auto bg-discord-blurple text-white text-xs px-2 py-0.5 rounded-full">
            {item.badge}
          </span>
        )}
      </NavLink>
      {editMode && onToggleHide && (
        <button
          onClick={() => onToggleHide(item.name)}
          className="p-1.5 text-discord-light hover:text-white shrink-0"
          title={isHidden ? 'Restore item' : 'Hide item'}
        >
          {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { guildId } = useParams<{ guildId: string }>();
  const [editMode, setEditMode] = useState(false);
  const queryClient = useQueryClient();

  const { data: preferences } = useQuery({
    queryKey: ['me-preferences'],
    queryFn: preferencesApi.get,
    staleTime: Infinity,
  });

  const hiddenNav: string[] = preferences?.hidden_nav ?? [];

  const updateMutation = useMutation({
    mutationFn: preferencesApi.update,
    onMutate: async (newPrefs) => {
      await queryClient.cancelQueries({ queryKey: ['me-preferences'] });
      const previous = queryClient.getQueryData(['me-preferences']);
      queryClient.setQueryData(['me-preferences'], newPrefs);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['me-preferences'], ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['me-preferences'] });
    },
  });

  function toggleHide(name: string) {
    const next = hiddenNav.includes(name)
      ? hiddenNav.filter(n => n !== name)
      : [...hiddenNav, name];
    updateMutation.mutate({ hidden_nav: next });
  }

  if (!guildId) {
    return null;
  }

  const allNavItems = getNavItems(guildId);
  const visibleItems = allNavItems.filter(item => !hiddenNav.includes(item.name));
  const hiddenItems = allNavItems.filter(item => hiddenNav.includes(item.name));

  return (
    <OnCloseContext.Provider value={onClose}>
      <aside className="w-64 bg-discord-darker border-r border-discord-dark shrink-0 overflow-y-auto h-full overscroll-contain">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-discord-light uppercase tracking-wider">
              Server Settings
            </h2>
            <div className="flex items-center gap-1">
              {editMode ? (
                <button
                  onClick={() => setEditMode(false)}
                  className="text-xs text-discord-blurple hover:text-white transition-colors px-2 py-1 rounded"
                >
                  Done
                </button>
              ) : (
                <button
                  onClick={() => setEditMode(true)}
                  className="text-discord-light hover:text-white transition-colors"
                  title="Customize sidebar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  aria-label="Close menu"
                  className="text-discord-light hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          <nav className="space-y-1">
            {(editMode ? allNavItems : visibleItems).map((item) => (
              <NavItemComponent
                key={item.href}
                item={item}
                editMode={editMode}
                isHidden={hiddenNav.includes(item.name)}
                onToggleHide={editMode ? toggleHide : undefined}
              />
            ))}
          </nav>

          {editMode && hiddenItems.length > 0 && (
            <div className="mt-4 pt-4 border-t border-discord-dark">
              <p className="text-xs font-semibold text-discord-light uppercase tracking-wider mb-2">
                Hidden ({hiddenItems.length})
              </p>
              <nav className="space-y-1">
                {hiddenItems.map((item) => (
                  <NavItemComponent
                    key={item.href}
                    item={item}
                    editMode={editMode}
                    isHidden={true}
                    onToggleHide={toggleHide}
                  />
                ))}
              </nav>
            </div>
          )}
        </div>
      </aside>
    </OnCloseContext.Provider>
  );
}
```

**Step 2: Build to verify no TypeScript errors**

```bash
cd /home/plex/wall-e-bot
node_modules/.bin/tsc -p dashboard/frontend/tsconfig.app.json --noEmit
```

Expected: no errors.

**Step 3: Visual verification**

Open the dashboard sidebar. Confirm:
- Pencil icon appears next to "Server Settings"
- Clicking pencil shows EyeOff buttons on every nav item + "Done" button
- Clicking EyeOff on "Starboard" hides it immediately and it appears in "Hidden (1)" section
- Clicking Done exits edit mode; "Starboard" is no longer in the nav
- Refreshing the page — Starboard is still hidden (persisted to DB)
- Clicking pencil again, clicking Eye on "Starboard" in the Hidden section restores it

**Step 4: Commit**

```bash
git add dashboard/frontend/src/services/api.ts dashboard/frontend/src/components/Sidebar.tsx
git commit -m "feat: per-user hidden nav items with sidebar edit mode"
```

---

### Task 4: Deploy

**Step 1: Push to remote**

```bash
git push origin main
```

**Step 2: Deploy on VPS**

```bash
cd /opt/wall-e-bot && git pull && docker compose -f docker/docker-compose.yml build --no-cache && docker compose -f docker/docker-compose.yml up -d && docker compose -f docker/docker-compose.yml exec backend node dist/db/migrate.js
```

Expected: `Migrations completed successfully!` — the `preferences` column is added to `users`.

**Step 3: Smoke test on production**

Visit wall-e.sullyflix.com, open a server dashboard, verify the pencil icon and hide/restore flow works.
