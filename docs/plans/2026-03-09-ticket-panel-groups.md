# Ticket Panel Groups Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fragile string-based `stack_group` system with first-class `ticket_panel_groups` objects, add visual reordering within groups on the dashboard, and enable sending/re-sending stacked panel messages directly from the dashboard.

**Architecture:** New `ticket_panel_groups` table holds group identity and last-sent Discord message info. `ticket_panels.group_id` FK replaces the old `stack_group` text field. Backend gains CRUD routes for groups, a panel-assignment endpoint, and Discord-posting endpoints that call the Discord REST API directly using the bot token. Frontend reorganizes the Panels tab into Groups + Ungrouped sections with up/down reordering and a Send-to-Channel modal.

**Tech Stack:** PostgreSQL, Express, TypeScript, React, TanStack Query, Discord REST API v10, lucide-react

---

### Task 1: DB migration — add ticket_panel_groups, add group_id, drop stack_group

**Files:**
- Modify: `dashboard/backend/src/db/migrate.ts`

**Context:** `migrate.ts` runs migrations sequentially — each new migration is added as a new entry in the migrations array. The `stack_group` column currently lives on `ticket_panels` (added around line 265). We replace it with a `group_id` FK pointing to a new `ticket_panel_groups` table. `stack_position` stays — it now means order within the group.

**Step 1: Read the end of the migrations array in `migrate.ts`**

Find the last migration entry to understand the numbering/structure, then add the new migration after it:

```sql
CREATE TABLE IF NOT EXISTS ticket_panel_groups (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  last_channel_id VARCHAR(20),
  last_message_id VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_panel_groups_guild
  ON ticket_panel_groups(guild_id);

ALTER TABLE ticket_panels
  ADD COLUMN IF NOT EXISTS group_id INTEGER
    REFERENCES ticket_panel_groups(id) ON DELETE SET NULL;

ALTER TABLE ticket_panels
  DROP COLUMN IF EXISTS stack_group;
```

**Step 2: Build check**

```bash
cd /home/plex/wall-e-bot/dashboard/backend && ../../node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add dashboard/backend/src/db/migrate.ts
git commit -m "feat: add ticket_panel_groups migration"
```

---

### Task 2: Backend — ticket-panel-groups CRUD routes

**Files:**
- Modify: `dashboard/backend/src/routes/guilds.ts`

**Context:** All ticket routes live in `guilds.ts` (lines 935–1326). Add group CRUD routes after the existing `DELETE /ticket-panels/:panelId` handler (~line 1096). The file already has `requireAuth`, `requireGuildAccess`, `asyncHandler`, `db`, and `logger` in scope — no new imports needed.

The `GET /ticket-panels` query (around line 974) uses `SELECT *` so `group_id` and `stack_position` are already included in responses after the migration.

**Step 1: Add group CRUD routes**

After the `DELETE /ticket-panels/:panelId` handler, add:

```typescript
// GET /api/guilds/:guildId/ticket-panel-groups
guildsRouter.get('/:guildId/ticket-panel-groups', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const result = await db.query(
    `SELECT g.*,
       COALESCE(json_agg(p.* ORDER BY p.stack_position) FILTER (WHERE p.id IS NOT NULL), '[]') AS panels
     FROM ticket_panel_groups g
     LEFT JOIN ticket_panels p ON p.group_id = g.id
     WHERE g.guild_id = $1
     GROUP BY g.id
     ORDER BY g.id`,
    [guildId],
  );
  res.json(result.rows);
}));

// POST /api/guilds/:guildId/ticket-panel-groups
guildsRouter.post('/:guildId/ticket-panel-groups', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const { name } = req.body as { name: string };
  if (!name || !name.trim()) { res.status(400).json({ error: 'name is required' }); return; }
  const result = await db.query(
    `INSERT INTO ticket_panel_groups (guild_id, name) VALUES ($1, $2) RETURNING *`,
    [guildId, name.trim()],
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /api/guilds/:guildId/ticket-panel-groups/:groupId
guildsRouter.put('/:guildId/ticket-panel-groups/:groupId', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId, groupId } = req.params;
  const { name } = req.body as { name: string };
  if (!name || !name.trim()) { res.status(400).json({ error: 'name is required' }); return; }
  const result = await db.query(
    `UPDATE ticket_panel_groups SET name = $1 WHERE id = $2 AND guild_id = $3 RETURNING *`,
    [name.trim(), groupId, guildId],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(result.rows[0]);
}));

// DELETE /api/guilds/:guildId/ticket-panel-groups/:groupId
guildsRouter.delete('/:guildId/ticket-panel-groups/:groupId', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId, groupId } = req.params;
  await db.query(`UPDATE ticket_panels SET group_id = NULL WHERE group_id = $1`, [groupId]);
  const result = await db.query(
    `DELETE FROM ticket_panel_groups WHERE id = $1 AND guild_id = $2`,
    [groupId, guildId],
  );
  if ((result.rowCount ?? 0) === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.status(204).end();
}));
```

**Step 2: Build check**

```bash
cd /home/plex/wall-e-bot/dashboard/backend && ../../node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add dashboard/backend/src/routes/guilds.ts
git commit -m "feat: add ticket-panel-groups CRUD routes"
```

---

### Task 3: Backend — panel group assignment endpoint

**Files:**
- Modify: `dashboard/backend/src/routes/guilds.ts`

**Context:** This endpoint lets the frontend assign or remove a panel from a group and set its `stack_position`. Add it after the group CRUD routes from Task 2.

**Step 1: Add the assignment route**

```typescript
// PUT /api/guilds/:guildId/ticket-panels/:panelId/group
guildsRouter.put('/:guildId/ticket-panels/:panelId/group', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId, panelId } = req.params;
  const { group_id, stack_position } = req.body as { group_id: number | null; stack_position: number };

  if (group_id != null) {
    const groupCheck = await db.query(
      `SELECT id FROM ticket_panel_groups WHERE id = $1 AND guild_id = $2`,
      [group_id, guildId],
    );
    if (groupCheck.rows.length === 0) { res.status(404).json({ error: 'Group not found' }); return; }
  }

  const result = await db.query(
    `UPDATE ticket_panels SET group_id = $1, stack_position = $2 WHERE id = $3 AND guild_id = $4 RETURNING *`,
    [group_id ?? null, stack_position ?? 0, panelId, guildId],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Panel not found' }); return; }
  res.json(result.rows[0]);
}));
```

**Step 2: Build check**

```bash
cd /home/plex/wall-e-bot/dashboard/backend && ../../node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add dashboard/backend/src/routes/guilds.ts
git commit -m "feat: add panel group assignment endpoint"
```

---

### Task 4: Backend — Discord send endpoints

**Files:**
- Modify: `dashboard/backend/src/routes/guilds.ts`

**Context:** These endpoints build Discord message components and POST (or PATCH) them to the Discord channel REST API using the bot token. The bot's existing `/ticket panel send` handler sends an embed with title `'🎫 Open a Ticket'` and components built per panel. We replicate the same structure using Discord REST (not discord.js builders — just plain JSON objects).

Discord component types: `1` = ActionRow, `2` = Button, `3` = StringSelect
Button style `1` = Primary (blurple)
Custom IDs: `ticket_open:{panelId}:{categoryId}` for buttons, `ticket_select:{panelId}` for select menus
Auth header: `Authorization: Bot ${process.env.DISCORD_TOKEN}`

**Step 1: Add `buildPanelComponents` helper**

Add this function just before the new send routes (still inside the guilds.ts module scope, not inside a route handler):

```typescript
function buildPanelComponents(panel: {
  id: number;
  panel_type: string;
  categories: Array<{ id: number; name: string; emoji: string | null; description: string | null }> | null;
}) {
  const cats = panel.categories ?? [];
  if (panel.panel_type === 'dropdown') {
    return [{
      type: 1,
      components: [{
        type: 3,
        custom_id: `ticket_select:${panel.id}`,
        placeholder: 'Select a ticket type',
        options: cats.map(c => ({
          label: c.name,
          value: String(c.id),
          ...(c.emoji ? { emoji: { name: c.emoji } } : {}),
          ...(c.description ? { description: c.description } : {}),
        })),
      }],
    }];
  }
  // buttons: up to 5 per ActionRow
  const rows = [];
  for (let i = 0; i < cats.length; i += 5) {
    rows.push({
      type: 1,
      components: cats.slice(i, i + 5).map(c => ({
        type: 2,
        style: 1,
        label: c.name,
        custom_id: `ticket_open:${panel.id}:${c.id}`,
        ...(c.emoji ? { emoji: { name: c.emoji } } : {}),
      })),
    });
  }
  return rows;
}
```

**Step 2: Add helper `discordSend` to post or patch a Discord message**

```typescript
async function discordSend(
  channelId: string,
  messageId: string | null,
  body: object,
): Promise<{ id: string; channel_id: string }> {
  const url = messageId
    ? `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`
    : `https://discord.com/api/v10/channels/${channelId}/messages`;
  const method = messageId ? 'PATCH' : 'POST';
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Discord API ${res.status}: ${err}`);
  }
  return res.json() as Promise<{ id: string; channel_id: string }>;
}
```

**Step 3: Add group send route**

```typescript
// POST /api/guilds/:guildId/ticket-panel-groups/:groupId/send
guildsRouter.post('/:guildId/ticket-panel-groups/:groupId/send', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId, groupId } = req.params;
  const { channel_id } = req.body as { channel_id: string };
  if (!channel_id) { res.status(400).json({ error: 'channel_id is required' }); return; }

  const groupResult = await db.query(
    `SELECT * FROM ticket_panel_groups WHERE id = $1 AND guild_id = $2`,
    [groupId, guildId],
  );
  if (groupResult.rows.length === 0) { res.status(404).json({ error: 'Group not found' }); return; }
  const group = groupResult.rows[0] as {
    id: number; name: string; last_channel_id: string | null; last_message_id: string | null;
  };

  const panelsResult = await db.query(
    `SELECT p.*, COALESCE(json_agg(c ORDER BY c.position) FILTER (WHERE c.id IS NOT NULL), '[]') AS categories
     FROM ticket_panels p
     LEFT JOIN ticket_categories c ON c.panel_id = p.id
     WHERE p.group_id = $1
     GROUP BY p.id
     ORDER BY p.stack_position`,
    [groupId],
  );
  if (panelsResult.rows.length === 0) { res.status(400).json({ error: 'Group has no panels' }); return; }

  const components = panelsResult.rows.flatMap(p => buildPanelComponents(p));
  const body = {
    embeds: [{ color: 5793266, title: '🎫 Open a Ticket', description: group.name }],
    components,
  };

  try {
    const targetChannelId = group.last_message_id ? (group.last_channel_id ?? channel_id) : channel_id;
    const message = await discordSend(targetChannelId, group.last_message_id, body);

    await db.query(
      `UPDATE ticket_panel_groups SET last_channel_id = $1, last_message_id = $2 WHERE id = $3`,
      [message.channel_id, message.id, groupId],
    );
    await db.query(
      `UPDATE ticket_panels SET panel_channel_id = $1, panel_message_id = $2 WHERE group_id = $3`,
      [message.channel_id, message.id, groupId],
    );
    res.json({ channel_id: message.channel_id, message_id: message.id });
  } catch (e) {
    logger.error('Discord send failed:', e);
    res.status(502).json({ error: (e as Error).message });
  }
}));
```

**Step 4: Add single panel send route**

```typescript
// POST /api/guilds/:guildId/ticket-panels/:panelId/send
guildsRouter.post('/:guildId/ticket-panels/:panelId/send', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId, panelId } = req.params;
  const { channel_id } = req.body as { channel_id: string };
  if (!channel_id) { res.status(400).json({ error: 'channel_id is required' }); return; }

  const panelResult = await db.query(
    `SELECT p.*, COALESCE(json_agg(c ORDER BY c.position) FILTER (WHERE c.id IS NOT NULL), '[]') AS categories
     FROM ticket_panels p
     LEFT JOIN ticket_categories c ON c.panel_id = p.id
     WHERE p.id = $1 AND p.guild_id = $2
     GROUP BY p.id`,
    [panelId, guildId],
  );
  if (panelResult.rows.length === 0) { res.status(404).json({ error: 'Panel not found' }); return; }
  const panel = panelResult.rows[0] as {
    id: number; name: string; panel_channel_id: string | null; panel_message_id: string | null;
    panel_type: string; categories: Array<{ id: number; name: string; emoji: string | null; description: string | null }>;
  };

  const components = buildPanelComponents(panel);
  const body = {
    embeds: [{ color: 5793266, title: '🎫 Open a Ticket', description: panel.name }],
    components,
  };

  try {
    const targetChannelId = panel.panel_message_id ? (panel.panel_channel_id ?? channel_id) : channel_id;
    const message = await discordSend(targetChannelId, panel.panel_message_id, body);
    await db.query(
      `UPDATE ticket_panels SET panel_channel_id = $1, panel_message_id = $2 WHERE id = $3`,
      [message.channel_id, message.id, panelId],
    );
    res.json({ channel_id: message.channel_id, message_id: message.id });
  } catch (e) {
    logger.error('Discord send failed:', e);
    res.status(502).json({ error: (e as Error).message });
  }
}));
```

**Step 5: Build check**

```bash
cd /home/plex/wall-e-bot/dashboard/backend && ../../node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 6: Commit**

```bash
git add dashboard/backend/src/routes/guilds.ts
git commit -m "feat: add Discord send endpoints for panel groups and single panels"
```

---

### Task 5: Bot — update /ticket panel send to use group_id

**Files:**
- Modify: `bot/src/commands/admin/ticket.ts`

**Context:** The `panel send` subcommand at lines 165–173 checks `rootPanel.stack_group` and queries siblings by that string. Since `stack_group` is dropped from the DB, we update it to use `group_id` instead. The initial panel fetch at lines 151–154 uses `SELECT *` — after the migration drops `stack_group`, that column simply won't be in the result, and the reference `rootPanel.stack_group` will be `undefined` at runtime (TypeScript won't catch this since it's `SELECT *` returning untyped rows). We must explicitly update the logic.

**Step 1: Replace the stack_group block (lines 165–173)**

Find:
```typescript
if (rootPanel.stack_group) {
  const stackResult = await client.db.pool.query(
    'SELECT * FROM ticket_panels WHERE guild_id = $1 AND stack_group = $2 ORDER BY stack_position, id',
    [interaction.guild!.id, rootPanel.stack_group],
  );
  panelsToSend = stackResult.rows;
} else {
  panelsToSend = [rootPanel];
}
```

Replace with:
```typescript
if (rootPanel.group_id) {
  const stackResult = await client.db.pool.query(
    'SELECT * FROM ticket_panels WHERE group_id = $1 ORDER BY stack_position, id',
    [rootPanel.group_id],
  );
  panelsToSend = stackResult.rows;
} else {
  panelsToSend = [rootPanel];
}
```

**Step 2: Build check**

```bash
cd /home/plex/wall-e-bot/bot && ../../node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add bot/src/commands/admin/ticket.ts
git commit -m "fix: update /ticket panel send to use group_id instead of stack_group"
```

---

### Task 6: Frontend — Panels tab restructure + Send to Channel

**Files:**
- Modify: `dashboard/frontend/src/pages/guild/TicketsPage.tsx`
- Modify: `dashboard/frontend/src/services/api.ts`

**Context:** The current Panels tab (lines 286–547) shows a flat list of expandable panel cards. We restructure it into two sections (Groups and Ungrouped Panels) and add group management UI, up/down reordering within groups, and a Send-to-Channel modal. TicketsPage doesn't currently fetch channels — we add that query for the channel picker.

The file is 655 lines. Key areas to modify:
- Top-level interfaces (~lines 10–68): add `PanelGroup` interface, add `group_id`/`stack_position` to `Panel`
- State/queries section: add groups query, channels query, new mutations
- Panels tab JSX (~lines 286–547): full restructure

**Step 1: Add `Send` and `Pencil` to lucide-react imports in TicketsPage.tsx**

Find the existing lucide-react import line at the top of the file and add `Send` and `Pencil` (if not already present).

**Step 2: Add new types**

After the existing `Panel` interface, add:

```typescript
interface PanelGroup {
  id: number;
  guild_id: string;
  name: string;
  last_channel_id: string | null;
  last_message_id: string | null;
  panels: Panel[];
}

interface DiscordChannel {
  id: string;
  name: string;
  parent_id: string | null;
}
```

Update `Panel` interface to add:
```typescript
  group_id: number | null;
  stack_position: number;
```

**Step 3: Add API methods to `api.ts`**

In the `ticketApi` object, add:

```typescript
getGroups: (guildId: string) =>
  api.get<PanelGroup[]>(`/api/guilds/${guildId}/ticket-panel-groups`),
createGroup: (guildId: string, data: { name: string }) =>
  api.post<PanelGroup>(`/api/guilds/${guildId}/ticket-panel-groups`, data),
updateGroup: (guildId: string, groupId: number, data: { name: string }) =>
  api.put<PanelGroup>(`/api/guilds/${guildId}/ticket-panel-groups/${groupId}`, data),
deleteGroup: (guildId: string, groupId: number) =>
  api.delete(`/api/guilds/${guildId}/ticket-panel-groups/${groupId}`),
assignPanelGroup: (guildId: string, panelId: number, data: { group_id: number | null; stack_position: number }) =>
  api.put(`/api/guilds/${guildId}/ticket-panels/${panelId}/group`, data),
sendGroup: (guildId: string, groupId: number, data: { channel_id: string }) =>
  api.post(`/api/guilds/${guildId}/ticket-panel-groups/${groupId}/send`, data),
sendPanel: (guildId: string, panelId: number, data: { channel_id: string }) =>
  api.post(`/api/guilds/${guildId}/ticket-panels/${panelId}/send`, data),
```

**Step 4: Add queries and state in TicketsPage component**

In the TicketsPage component body, alongside the existing `panels` query, add:

```typescript
const { data: groups = [] } = useQuery<PanelGroup[]>({
  queryKey: ['ticket-groups', guildId],
  queryFn: () => ticketApi.getGroups(guildId!).then(r => r.data),
});

const { data: channels = [] } = useQuery<DiscordChannel[]>({
  queryKey: ['channels', guildId],
  queryFn: () => api.get(`/api/guilds/${guildId}/channels`).then(r => r.data),
});

const [showNewGroup, setShowNewGroup] = useState(false);
const [newGroupName, setNewGroupName] = useState('');
```

**Step 5: Add mutations in TicketsPage component**

```typescript
const invalidateGroups = () => queryClient.invalidateQueries({ queryKey: ['ticket-groups', guildId] });
const invalidatePanels = () => queryClient.invalidateQueries({ queryKey: ['ticket-panels', guildId] });

const createGroupMutation = useMutation({
  mutationFn: (name: string) => ticketApi.createGroup(guildId!, { name }),
  onSuccess: () => { invalidateGroups(); setShowNewGroup(false); setNewGroupName(''); },
});

const deleteGroupMutation = useMutation({
  mutationFn: (groupId: number) => ticketApi.deleteGroup(guildId!, groupId),
  onSuccess: () => { invalidateGroups(); invalidatePanels(); },
});

const assignGroupMutation = useMutation({
  mutationFn: ({ panelId, groupId, position }: { panelId: number; groupId: number | null; position: number }) =>
    ticketApi.assignPanelGroup(guildId!, panelId, { group_id: groupId, stack_position: position }),
  onSuccess: () => { invalidateGroups(); invalidatePanels(); },
});
```

**Step 6: Add `ungroupedPanels` derived value**

```typescript
const ungroupedPanels = panels.filter(p => p.group_id == null);
```

**Step 7: Replace the Panels tab JSX content**

The Panels tab currently renders a `<div className="space-y-4">` with a flat list of panel cards and a "+ New Panel" button in the header. Replace the entire tab content with:

```tsx
<div className="space-y-6">
  {/* Groups section */}
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-discord-light uppercase tracking-wider">Groups</h3>
      <button
        onClick={() => setShowNewGroup(true)}
        className="btn btn-secondary flex items-center gap-1 text-xs py-1 px-2"
      >
        <Plus className="w-3 h-3" /> New Group
      </button>
    </div>

    {showNewGroup && (
      <div className="card flex items-center gap-2 border border-discord-blurple/30">
        <input
          value={newGroupName}
          onChange={e => setNewGroupName(e.target.value)}
          placeholder="Group name"
          className="input flex-1"
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter' && newGroupName.trim()) createGroupMutation.mutate(newGroupName.trim());
            if (e.key === 'Escape') { setShowNewGroup(false); setNewGroupName(''); }
          }}
        />
        <button
          onClick={() => { if (newGroupName.trim()) createGroupMutation.mutate(newGroupName.trim()); }}
          disabled={!newGroupName.trim() || createGroupMutation.isPending}
          className="btn btn-primary text-sm"
        >Create</button>
        <button onClick={() => { setShowNewGroup(false); setNewGroupName(''); }} className="btn btn-secondary text-sm">Cancel</button>
      </div>
    )}

    {groups.length === 0 && !showNewGroup && (
      <p className="text-sm text-discord-light">
        No groups yet. Create a group to deploy multiple panels as one Discord message.
      </p>
    )}

    {groups.map(group => (
      <GroupCard
        key={group.id}
        group={group}
        channels={channels}
        guildId={guildId!}
        onDelete={() => deleteGroupMutation.mutate(group.id)}
        onRemovePanel={panelId => assignGroupMutation.mutate({ panelId, groupId: null, position: 0 })}
        onReorder={(panelId, position) => assignGroupMutation.mutate({ panelId, groupId: group.id, position })}
      />
    ))}
  </div>

  {/* Ungrouped Panels section */}
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-discord-light uppercase tracking-wider">Ungrouped Panels</h3>
      <button onClick={handleAddPanel} className="btn btn-primary flex items-center gap-2 text-sm">
        <Plus className="w-4 h-4" /> New Panel
      </button>
    </div>

    {ungroupedPanels.length === 0 && (
      <p className="text-sm text-discord-light">No ungrouped panels.</p>
    )}

    {ungroupedPanels.map(panel => (
      /* existing panel card JSX — keep all existing panel expand/edit logic intact */
      /* add "Add to Group" select and per-panel Send button to the panel card header action area */
    ))}
  </div>
</div>
```

**Step 8: Add "Add to Group" and "Send" to each ungrouped panel card header**

In the existing panel card header (the row with the panel name and action buttons), add before the delete button:

```tsx
{/* Add to Group */}
<select
  value=""
  onChange={e => {
    if (e.target.value)
      assignGroupMutation.mutate({ panelId: panel.id!, groupId: parseInt(e.target.value, 10), position: 0 });
  }}
  className="input text-xs py-1 h-auto"
>
  <option value="">Add to group…</option>
  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
</select>

{/* Send to Channel */}
<PanelSendButton panel={panel} channels={channels} guildId={guildId!} />
```

**Step 9: Add `GroupCard` component (define above `TicketsPage` function, in the same file)**

```tsx
function GroupCard({
  group, channels, guildId, onDelete, onRemovePanel, onReorder,
}: {
  group: PanelGroup;
  channels: DiscordChannel[];
  guildId: string;
  onDelete: () => void;
  onRemovePanel: (panelId: number) => void;
  onReorder: (panelId: number, newPosition: number) => void;
}) {
  const queryClient = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(group.name);
  const [showSend, setShowSend] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (name: string) => ticketApi.updateGroup(guildId, group.id, { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ticket-groups', guildId] }); setEditingName(false); },
  });

  const sendMutation = useMutation({
    mutationFn: (channelId: string) => ticketApi.sendGroup(guildId, group.id, { channel_id: channelId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ticket-groups', guildId] }); setShowSend(false); },
  });

  const sorted = [...group.panels].sort((a, b) => a.stack_position - b.stack_position);

  const move = (panelId: number, dir: -1 | 1) => {
    const idx = sorted.findIndex(p => p.id === panelId);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    onReorder(panelId, sorted[swapIdx].stack_position);
    onReorder(sorted[swapIdx].id!, sorted[idx].stack_position);
  };

  return (
    <div className="card border border-discord-blurple/20 space-y-3">
      <div className="flex items-center gap-2">
        {editingName ? (
          <input
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            className="input flex-1"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && nameVal.trim()) updateMutation.mutate(nameVal.trim());
              if (e.key === 'Escape') { setEditingName(false); setNameVal(group.name); }
            }}
          />
        ) : (
          <h4 className="font-semibold flex-1">{group.name}</h4>
        )}
        <button onClick={() => setEditingName(v => !v)} className="btn btn-secondary p-1.5" title="Rename">
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowSend(true)}
          className="btn btn-primary flex items-center gap-2 text-sm"
        >
          <Send className="w-4 h-4" />
          {group.last_channel_id ? 'Re-send' : 'Send to Channel'}
        </button>
        <button
          onClick={() => window.confirm(`Disband "${group.name}"? Panels will become ungrouped.`) && onDelete()}
          className="btn bg-red-500/20 text-red-400 hover:bg-red-500/30 p-1.5"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {sorted.length === 0 && (
        <p className="text-sm text-discord-light">No panels yet. Use "Add to group…" on an ungrouped panel.</p>
      )}

      {sorted.map((panel, idx) => (
        <div key={panel.id} className="flex items-center gap-2 bg-discord-darker rounded-lg px-3 py-2">
          <div className="flex flex-col">
            <button
              onClick={() => move(panel.id!, -1)}
              disabled={idx === 0}
              className="text-discord-light hover:text-white disabled:opacity-30 text-xs leading-tight"
            >▲</button>
            <button
              onClick={() => move(panel.id!, 1)}
              disabled={idx === sorted.length - 1}
              className="text-discord-light hover:text-white disabled:opacity-30 text-xs leading-tight"
            >▼</button>
          </div>
          <span className="flex-1 font-medium text-sm">{panel.name}</span>
          <span className="text-xs text-discord-light">
            {panel.panel_type} · {panel.categories?.length ?? 0} categories
          </span>
          <button
            onClick={() => onRemovePanel(panel.id!)}
            className="btn btn-secondary text-xs py-0.5 px-2"
          >Remove</button>
        </div>
      ))}

      {showSend && (
        <SendChannelModal
          channels={channels}
          defaultChannelId={group.last_channel_id}
          isPending={sendMutation.isPending}
          error={sendMutation.error ? (sendMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to send' : null}
          onSend={channelId => sendMutation.mutate(channelId)}
          onClose={() => setShowSend(false)}
        />
      )}
    </div>
  );
}
```

**Step 10: Add `PanelSendButton` component (in the same file)**

```tsx
function PanelSendButton({ panel, channels, guildId }: { panel: Panel; channels: DiscordChannel[]; guildId: string }) {
  const queryClient = useQueryClient();
  const [showSend, setShowSend] = useState(false);
  const sendMutation = useMutation({
    mutationFn: (channelId: string) => ticketApi.sendPanel(guildId, panel.id!, { channel_id: channelId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ticket-panels', guildId] }); setShowSend(false); },
  });
  return (
    <>
      <button onClick={() => setShowSend(true)} className="btn btn-secondary p-1.5" title="Send to channel">
        <Send className="w-4 h-4" />
      </button>
      {showSend && (
        <SendChannelModal
          channels={channels}
          defaultChannelId={panel.panel_channel_id ?? null}
          isPending={sendMutation.isPending}
          error={sendMutation.error ? (sendMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to send' : null}
          onSend={channelId => sendMutation.mutate(channelId)}
          onClose={() => setShowSend(false)}
        />
      )}
    </>
  );
}
```

Note: `panel.panel_channel_id` needs to be added to the `Panel` interface if not already present. Check the existing interface and add `panel_channel_id: string | null; panel_message_id: string | null;` if missing.

**Step 11: Add `SendChannelModal` component (in the same file)**

```tsx
function SendChannelModal({
  channels, defaultChannelId, isPending, error, onSend, onClose,
}: {
  channels: DiscordChannel[];
  defaultChannelId: string | null;
  isPending: boolean;
  error: string | null;
  onSend: (channelId: string) => void;
  onClose: () => void;
}) {
  const [channelId, setChannelId] = useState(defaultChannelId ?? '');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="card w-full max-w-md space-y-4">
        <h3 className="font-semibold">Send to Channel</h3>
        <div>
          <label className="block text-sm font-medium mb-1">Channel</label>
          <select value={channelId} onChange={e => setChannelId(e.target.value)} className="input w-full">
            <option value="">— Select channel —</option>
            {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button
            onClick={() => { if (channelId) onSend(channelId); }}
            disabled={!channelId || isPending}
            className="btn btn-primary"
          >
            {isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 12: Build check**

```bash
cd /home/plex/wall-e-bot/dashboard/frontend && ../../node_modules/.bin/tsc --noEmit
```

Expected: no errors. Fix any type mismatches (e.g. missing fields on `Panel` interface, missing imports).

**Step 13: Commit**

```bash
git add dashboard/frontend/src/pages/guild/TicketsPage.tsx dashboard/frontend/src/services/api.ts
git commit -m "feat: restructure Panels tab with Groups/Ungrouped sections and Send to Channel"
```

---

### Task 7: Deploy

**Step 1: Push**

```bash
git push origin main
```

**Step 2: Deploy on VPS**

```bash
cd /opt/wall-e-bot && git pull && docker compose -f docker/docker-compose.yml build --no-cache && docker compose -f docker/docker-compose.yml up -d && docker compose -f docker/docker-compose.yml exec backend node dist/db/migrate.js
```

**Note:** Existing panels that used `stack_group` will have `group_id = NULL` after migration — they become ungrouped. Users will need to re-create groups via the new UI. No data is lost; the panels themselves are intact.

**Step 3: Verify**

- Navigate to Tickets → Panels tab in the dashboard
- "Groups" and "Ungrouped Panels" sections render
- Click "+ New Group" → type a name → create
- Use "Add to group…" dropdown on a panel → panel moves into group
- Use ▲▼ to reorder panels within a group
- Click "Send to Channel" → pick a channel → message appears in Discord with buttons/dropdowns
- Click "Re-send" → existing message is edited in place
- Click "Remove" on a panel in a group → panel drops back to Ungrouped
- Click trash on a group → confirms → group deleted, panels become Ungrouped
