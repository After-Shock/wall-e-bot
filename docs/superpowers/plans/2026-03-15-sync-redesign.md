# Sync Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-click sync with a modal that lets admins pick which of 6 categories to copy, backed by a robust transactional backend with batch inserts and FK remapping.

**Architecture:** The backend endpoint gains a `categories` array body param and a dedicated pool client for a single DB transaction; flat tables use `INSERT...SELECT`, FK-remapping tables (commands, tickets) use sequential inserts with `RETURNING id` for small parent tables and `unnest()` batch inserts for large child tables. The frontend gains `SyncModal.tsx` (idle/loading/result states) and `SyncPage.tsx` is stripped down to a source-picker + modal trigger.

**Tech Stack:** Express + `pg` (Pool + dedicated client for transactions), React + TanStack Query, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-15-sync-redesign-design.md`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `dashboard/backend/src/routes/guilds.ts` | Rewrite copy-from handler (lines 1651-1751) |
| Modify | `dashboard/frontend/src/pages/guild/SyncPage.tsx` | Strip to source picker + modal trigger |
| Create | `dashboard/frontend/src/pages/guild/SyncModal.tsx` | All modal logic (idle/loading/result) |

---

## Chunk 1: Backend — Rewrite copy-from endpoint

### Task 1: Replace the copy-from handler

**Files:**
- Modify: `dashboard/backend/src/routes/guilds.ts` lines 1651-1751

The new handler must:
- Accept `categories: string[]` in request body; return 400 if missing/empty
- Use `db.connect()` for a dedicated client; wrap all writes in `BEGIN`/`COMMIT`/`ROLLBACK`
- For `general` and/or `moderation`: fetch guild_configs once, apply `stripServerIds`, upsert — merge both if both selected
- For `commands`: DELETE existing command_groups (cascades to custom_commands), loop-insert command_groups with `RETURNING id` to build a groupIdMap, batch-insert custom_commands with remapped `group_id` using `unnest()`
- For `roles`: `INSERT INTO auto_roles SELECT ... FROM auto_roles WHERE guild_id = $sourceGuildId ON CONFLICT DO NOTHING` after deleting existing rows
- For `tickets`: insert ticket_config (upsert), loop-insert ticket_panel_groups (RETURNING id → panelGroupIdMap), loop-insert ticket_panels (RETURNING id → panelIdMap), loop-insert ticket_categories (RETURNING id → categoryIdMap), batch-insert ticket_form_fields via `unnest()`
- For `automation`: `INSERT...SELECT` for scheduled_messages + auto_delete_channels (delete existing first)
- Return `{ syncedCount: N }` where N = number of categories that wrote ≥ 1 row

- [ ] **Step 1: Read the current handler to confirm line range**

  Read `dashboard/backend/src/routes/guilds.ts` lines 1651–1751 and note the exact opening/closing of the `guildsRouter.post('/:guildId/copy-from/...')` block. Confirm the next route starts at line 1753.

- [ ] **Step 2: Replace the handler**

  Replace lines 1651–1751 with the new implementation below. Do a targeted Edit replacing the old block.

```typescript
// Copy settings from one guild to another (selective categories)
guildsRouter.post(
  '/:guildId/copy-from/:sourceGuildId',
  requireAuth,
  requireGuildAccess,  // checks :guildId (target)
  rateLimitByUser({ max: 3, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const targetGuildId = req.params.guildId;
    const { sourceGuildId } = req.params;
    const categories: string[] = Array.isArray(req.body?.categories) ? req.body.categories : [];

    const VALID = new Set(['general', 'moderation', 'commands', 'roles', 'tickets', 'automation']);
    const selected = categories.filter(c => VALID.has(c));

    if (selected.length === 0) {
      res.status(400).json({ error: 'Select at least one category to sync' });
      return;
    }
    if (targetGuildId === sourceGuildId) {
      res.status(400).json({ error: 'Cannot copy settings to the same server' });
      return;
    }
    if (!authReq.user?.guilds) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!userHasGuildAccess(authReq.user, sourceGuildId)) {
      res.status(403).json({ error: "You don't have permission to access the source server" });
      return;
    }

    const client = await db.connect();
    let syncedCount = 0;
    try {
      await client.query('BEGIN');

      // ── general / moderation (both live in guild_configs) ──────────────────
      if (selected.includes('general') || selected.includes('moderation')) {
        const srcCfg = await client.query(
          'SELECT config FROM guild_configs WHERE guild_id = $1',
          [sourceGuildId],
        );
        if (srcCfg.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ error: 'Source server has no configuration' });
          return;
        }
        const cleaned = stripServerIds(srcCfg.rows[0].config);
        await client.query(
          `INSERT INTO guild_configs (guild_id, config, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (guild_id) DO UPDATE SET config = $2, updated_at = NOW()`,
          [targetGuildId, JSON.stringify(cleaned)],
        );
        syncedCount++;
        if (selected.includes('general') && selected.includes('moderation')) {
          // both selected but they share one row — count only once extra
        } else if (selected.includes('moderation')) {
          // moderation-only still counts as one category written
        }
        // Adjust: if both are selected we still only wrote one row but user selected 2 categories.
        // The spec says count categories that had data — treat general+moderation each as having data
        // if the config row existed (which we verified above).
        if (selected.includes('general') && selected.includes('moderation')) syncedCount++; // add 1 more for the second
      }

      // ── commands ───────────────────────────────────────────────────────────
      if (selected.includes('commands')) {
        const srcGroups = await client.query(
          'SELECT id, name, description, position FROM command_groups WHERE guild_id = $1 ORDER BY position',
          [sourceGuildId],
        );
        // DELETE target groups (cascades to custom_commands via FK)
        await client.query('DELETE FROM command_groups WHERE guild_id = $1', [targetGuildId]);

        const groupIdMap = new Map<number, number>();
        for (const g of srcGroups.rows) {
          const ins = await client.query(
            `INSERT INTO command_groups
               (guild_id, name, description, allowed_roles, allowed_channels, ignore_roles, ignore_channels, position)
             VALUES ($1, $2, $3, '{}', '{}', '{}', '{}', $4)
             RETURNING id`,
            [targetGuildId, g.name, g.description, g.position],
          );
          groupIdMap.set(g.id as number, ins.rows[0].id as number);
        }

        const srcCmds = await client.query(
          `SELECT name, response, embed_response, embed_color, cooldown, delete_command,
                  created_by, trigger_type, group_id, responses, interval_cron,
                  reaction_emoji, reaction_type, case_sensitive, trigger_on_edit,
                  enabled, cembed_response, description
           FROM custom_commands WHERE guild_id = $1`,
          [sourceGuildId],
        );
        await client.query('DELETE FROM custom_commands WHERE guild_id = $1', [targetGuildId]);

        if (srcCmds.rows.length > 0) {
          const cols = {
            guildIds: [] as string[],
            names: [] as string[],
            responses: [] as (string | null)[],
            embedResponses: [] as (unknown)[],
            embedColors: [] as (string | null)[],
            cooldowns: [] as (number | null)[],
            deleteCommands: [] as (boolean | null)[],
            createdBys: [] as (string | null)[],
            triggerTypes: [] as (string | null)[],
            groupIds: [] as (number | null)[],
            responsesJson: [] as (unknown)[],
            intervalCrons: [] as (string | null)[],
            reactionEmojis: [] as (string | null)[],
            reactionTypes: [] as (string | null)[],
            caseSensitives: [] as (boolean | null)[],
            triggerOnEdits: [] as (boolean | null)[],
            enableds: [] as (boolean | null)[],
            cembedResponses: [] as (unknown)[],
            descriptions: [] as (string | null)[],
          };
          for (const c of srcCmds.rows) {
            cols.guildIds.push(targetGuildId);
            cols.names.push(c.name);
            cols.responses.push(c.response);
            cols.embedResponses.push(c.embed_response);
            cols.embedColors.push(c.embed_color);
            cols.cooldowns.push(c.cooldown);
            cols.deleteCommands.push(c.delete_command);
            cols.createdBys.push(c.created_by);
            cols.triggerTypes.push(c.trigger_type);
            cols.groupIds.push(c.group_id != null ? (groupIdMap.get(c.group_id) ?? null) : null);
            cols.responsesJson.push(c.responses);
            cols.intervalCrons.push(c.interval_cron);
            cols.reactionEmojis.push(c.reaction_emoji);
            cols.reactionTypes.push(c.reaction_type);
            cols.caseSensitives.push(c.case_sensitive);
            cols.triggerOnEdits.push(c.trigger_on_edit);
            cols.enableds.push(c.enabled);
            cols.cembedResponses.push(c.cembed_response);
            cols.descriptions.push(c.description);
          }
          await client.query(
            `INSERT INTO custom_commands
               (guild_id, name, response, embed_response, embed_color,
                allowed_roles, allowed_channels, cooldown, delete_command, created_by, uses,
                trigger_type, group_id, responses, interval_cron,
                interval_channel_id, interval_next_run,
                reaction_message_id, reaction_channel_id,
                reaction_emoji, reaction_type,
                case_sensitive, trigger_on_edit, enabled, cembed_response, description)
             SELECT
               unnest($1::text[]), unnest($2::text[]), unnest($3::text[]),
               unnest($4::jsonb[]), unnest($5::text[]),
               '{}', '{}',
               unnest($6::int[]), unnest($7::bool[]), unnest($8::text[]), 0,
               unnest($9::text[]), unnest($10::int[]), unnest($11::jsonb[]), unnest($12::text[]),
               NULL, NULL, NULL, NULL,
               unnest($13::text[]), unnest($14::text[]),
               unnest($15::bool[]), unnest($16::bool[]), unnest($17::bool[]),
               unnest($18::jsonb[]), unnest($19::text[])`,
            [
              cols.guildIds, cols.names, cols.responses,
              cols.embedResponses.map(v => JSON.stringify(v)), cols.embedColors,
              cols.cooldowns, cols.deleteCommands, cols.createdBys,
              cols.triggerTypes, cols.groupIds, cols.responsesJson.map(v => JSON.stringify(v)),
              cols.intervalCrons, cols.reactionEmojis, cols.reactionTypes,
              cols.caseSensitives, cols.triggerOnEdits, cols.enableds,
              cols.cembedResponses.map(v => JSON.stringify(v)), cols.descriptions,
            ],
          );
        }
        syncedCount++;
      }

      // ── roles ──────────────────────────────────────────────────────────────
      if (selected.includes('roles')) {
        await client.query('DELETE FROM auto_roles WHERE guild_id = $1', [targetGuildId]);
        const rolesIns = await client.query(
          `INSERT INTO auto_roles (guild_id, role_id, delay_minutes, include_bots)
           SELECT $2, role_id, delay_minutes, include_bots
           FROM auto_roles WHERE guild_id = $1`,
          [sourceGuildId, targetGuildId],
        );
        if (rolesIns.rowCount && rolesIns.rowCount > 0) syncedCount++;
      }

      // ── tickets ────────────────────────────────────────────────────────────
      if (selected.includes('tickets')) {
        let ticketRows = 0;

        // ticket_config (flat, one row per guild)
        const srcTktCfg = await client.query(
          'SELECT transcript_channel_id, max_tickets_per_user, auto_close_hours, welcome_message FROM ticket_config WHERE guild_id = $1',
          [sourceGuildId],
        );
        if (srcTktCfg.rows.length > 0) {
          const tc = srcTktCfg.rows[0];
          await client.query(
            `INSERT INTO ticket_config (guild_id, transcript_channel_id, max_tickets_per_user, auto_close_hours, welcome_message)
             VALUES ($1, NULL, $2, $3, $4)
             ON CONFLICT (guild_id) DO UPDATE
               SET transcript_channel_id = NULL,
                   max_tickets_per_user = $2,
                   auto_close_hours = $3,
                   welcome_message = $4`,
            [targetGuildId, tc.max_tickets_per_user, tc.auto_close_hours, tc.welcome_message],
          );
          ticketRows++;
        }

        // ticket_panel_groups → ticket_panels → ticket_categories → ticket_form_fields
        const srcPanelGroups = await client.query(
          'SELECT id, name FROM ticket_panel_groups WHERE guild_id = $1',
          [sourceGuildId],
        );
        await client.query('DELETE FROM ticket_panel_groups WHERE guild_id = $1', [targetGuildId]);

        const panelGroupIdMap = new Map<number, number>();
        for (const pg of srcPanelGroups.rows) {
          const ins = await client.query(
            `INSERT INTO ticket_panel_groups (guild_id, name, last_channel_id, last_message_id)
             VALUES ($1, $2, NULL, NULL) RETURNING id`,
            [targetGuildId, pg.name],
          );
          panelGroupIdMap.set(pg.id as number, ins.rows[0].id as number);
          ticketRows++;
        }

        const srcPanels = await client.query(
          `SELECT id, name, style, panel_type, panel_group_id, channel_name_template
           FROM ticket_panels WHERE guild_id = $1`,
          [sourceGuildId],
        );
        const panelIdMap = new Map<number, number>();
        for (const p of srcPanels.rows) {
          const newGroupId = p.panel_group_id != null ? (panelGroupIdMap.get(p.panel_group_id) ?? null) : null;
          const ins = await client.query(
            `INSERT INTO ticket_panels
               (guild_id, name, style, panel_type, panel_group_id,
                panel_channel_id, panel_message_id,
                category_open_id, category_closed_id, overflow_category_id,
                channel_name_template)
             VALUES ($1, $2, $3, $4, $5, NULL, NULL, NULL, NULL, NULL, $6)
             RETURNING id`,
            [targetGuildId, p.name, p.style, p.panel_type, newGroupId, p.channel_name_template],
          );
          panelIdMap.set(p.id as number, ins.rows[0].id as number);
          ticketRows++;
        }

        const srcCats = await client.query(
          `SELECT id, panel_id, name, emoji, description, support_role_ids, observer_role_ids, position
           FROM ticket_categories WHERE guild_id = $1`,
          [sourceGuildId],
        );
        const categoryIdMap = new Map<number, number>();
        for (const cat of srcCats.rows) {
          const newPanelId = panelIdMap.get(cat.panel_id) ?? null;
          const ins = await client.query(
            `INSERT INTO ticket_categories
               (panel_id, guild_id, name, emoji, description, support_role_ids, observer_role_ids, position)
             VALUES ($1, $2, $3, $4, $5, '{}', '{}', $6)
             RETURNING id`,
            [newPanelId, targetGuildId, cat.name, cat.emoji, cat.description, cat.position],
          );
          categoryIdMap.set(cat.id as number, ins.rows[0].id as number);
          ticketRows++;
        }

        const srcFields = await client.query(
          `SELECT tf.category_id, tf.label, tf.placeholder, tf.min_length, tf.max_length, tf.style, tf.required, tf.position
           FROM ticket_form_fields tf
           JOIN ticket_categories tc ON tc.id = tf.category_id
           WHERE tc.guild_id = $1`,
          [sourceGuildId],
        );
        if (srcFields.rows.length > 0) {
          const fCatIds: number[] = [];
          const fLabels: string[] = [];
          const fPlaceholders: (string | null)[] = [];
          const fMinLengths: (number | null)[] = [];
          const fMaxLengths: (number | null)[] = [];
          const fStyles: (number | null)[] = [];
          const fRequireds: boolean[] = [];
          const fPositions: number[] = [];
          for (const f of srcFields.rows) {
            fCatIds.push(categoryIdMap.get(f.category_id) ?? f.category_id);
            fLabels.push(f.label);
            fPlaceholders.push(f.placeholder);
            fMinLengths.push(f.min_length);
            fMaxLengths.push(f.max_length);
            fStyles.push(f.style);
            fRequireds.push(f.required);
            fPositions.push(f.position);
          }
          await client.query(
            `INSERT INTO ticket_form_fields
               (category_id, label, placeholder, min_length, max_length, style, required, position)
             SELECT
               unnest($1::int[]), unnest($2::text[]), unnest($3::text[]),
               unnest($4::int[]), unnest($5::int[]), unnest($6::int[]),
               unnest($7::bool[]), unnest($8::int[])`,
            [fCatIds, fLabels, fPlaceholders, fMinLengths, fMaxLengths, fStyles, fRequireds, fPositions],
          );
          ticketRows++;
        }

        if (ticketRows > 0) syncedCount++;
      }

      // ── automation ─────────────────────────────────────────────────────────
      if (selected.includes('automation')) {
        await client.query('DELETE FROM scheduled_messages WHERE guild_id = $1', [targetGuildId]);
        const smIns = await client.query(
          `INSERT INTO scheduled_messages
             (guild_id, channel_id, message, cron_expression, interval_minutes, next_run, enabled, created_by)
           SELECT $2, channel_id, message, cron_expression, interval_minutes, next_run, enabled, created_by
           FROM scheduled_messages WHERE guild_id = $1`,
          [sourceGuildId, targetGuildId],
        );

        await client.query('DELETE FROM auto_delete_channels WHERE guild_id = $1', [targetGuildId]);
        const adcIns = await client.query(
          `INSERT INTO auto_delete_channels
             (guild_id, channel_id, max_age_hours, max_messages, exempt_roles, enabled)
           SELECT $2, channel_id, max_age_hours, max_messages, '{}', enabled
           FROM auto_delete_channels WHERE guild_id = $1
           ON CONFLICT (guild_id, channel_id) DO NOTHING`,
          [sourceGuildId, targetGuildId],
        );
        if ((smIns.rowCount ?? 0) + (adcIns.rowCount ?? 0) > 0) syncedCount++;
      }

      await client.query('COMMIT');
      logger.info('Guild config copied', {
        sourceGuildId, targetGuildId, userId: authReq.user!.id, selected, syncedCount,
      });
      res.json({ syncedCount });
    } catch (error) {
      await client.query('ROLLBACK');
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Error copying guild config:', { sourceGuildId, targetGuildId, error: msg });
      res.status(500).json({ error: msg });
    } finally {
      client.release();
    }
  }),
);
```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd /home/plex/wall-e-bot/dashboard/backend && node_modules/.bin/tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Manual smoke test via curl (needs local backend running or VPS)**

  Test 400 on empty categories:
  ```bash
  curl -s -X POST http://localhost:3001/api/guilds/GUILD_ID/copy-from/SRC_ID \
    -H "Content-Type: application/json" \
    -H "Cookie: <session>" \
    -d '{"categories":[]}' | jq .
  ```
  Expected: `{"error":"Select at least one category to sync"}`

- [ ] **Step 5: Commit**

  ```bash
  cd /home/plex/wall-e-bot
  git add dashboard/backend/src/routes/guilds.ts
  git commit -m "feat: rewrite copy-from endpoint with categories param, transaction, batch inserts"
  ```

---

## Chunk 2: Frontend — SyncModal.tsx

### Task 2: Create SyncModal component

**Files:**
- Create: `dashboard/frontend/src/pages/guild/SyncModal.tsx`

The modal has three states: idle (category cards), loading (dimmed cards + spinner), result (success or error).

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle, X, Loader2 } from 'lucide-react';
import type { AxiosError } from 'axios';
import api from '../../api/axios';

const CATEGORIES = [
  { key: 'general',    emoji: '⚙️', name: 'General',         desc: 'Welcome, leveling, starboard, prefix' },
  { key: 'moderation', emoji: '🛡️', name: 'Moderation',      desc: 'Logging, automod, spam, word filters, link protection' },
  { key: 'commands',   emoji: '🤖', name: 'Custom Commands',  desc: 'Commands & groups, triggers, responses' },
  { key: 'roles',      emoji: '🎭', name: 'Roles',            desc: 'Auto roles (reaction roles not copied)' },
  { key: 'tickets',    emoji: '🎫', name: 'Tickets',          desc: 'Panels, categories, forms, ticket config' },
  { key: 'automation', emoji: '⏰', name: 'Automation',       desc: 'Scheduled messages, auto-delete channels' },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

interface Props {
  guildId: string;
  sourceGuildId: string;
  sourceName: string;
  onClose: () => void;
}

type ModalState = 'idle' | 'loading' | 'success' | 'error';

export default function SyncModal({ guildId, sourceGuildId, sourceName, onClose }: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<CategoryKey>>(
    new Set(CATEGORIES.map(c => c.key)),
  );
  const [modalState, setModalState] = useState<ModalState>('idle');
  const [syncedCount, setSyncedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const mutation = useMutation({
    mutationFn: async (categories: CategoryKey[]) => {
      const response = await api.post<{ syncedCount: number }>(
        `/api/guilds/${guildId}/copy-from/${sourceGuildId}`,
        { categories },
      );
      return response.data;
    },
    onMutate: () => setModalState('loading'),
    onSuccess: (data) => {
      setSyncedCount(data.syncedCount);
      setModalState('success');
      queryClient.invalidateQueries({ queryKey: ['guild', guildId] });
    },
    onError: (error: Error) => {
      const axiosError = error as AxiosError<{ error: string }>;
      setErrorMsg(axiosError.response?.data?.error ?? error.message);
      setModalState('error');
    },
  });

  const toggleCategory = (key: CategoryKey) => {
    if (modalState !== 'idle') return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleCopy = () => {
    mutation.mutate([...selected] as CategoryKey[]);
  };

  const handleTryAgain = () => {
    setModalState('idle');
    setErrorMsg('');
  };

  const isLoading = modalState === 'loading';

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={isLoading ? undefined : onClose}
    >
      <div
        className="bg-discord-secondary rounded-xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white">Sync Settings</h2>
            <p className="text-xs text-discord-light mt-0.5">
              Copying from <strong className="text-discord-normal">{sourceName}</strong> → this server
            </p>
          </div>
          {!isLoading && (
            <button onClick={onClose} className="text-discord-light hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Idle / Loading — category grid */}
        {(modalState === 'idle' || modalState === 'loading') && (
          <>
            {/* Select all / deselect all */}
            <div className="flex gap-2 px-6 mb-2">
              <button
                className="text-xs px-2.5 py-1 rounded bg-discord-blurple text-white font-semibold disabled:opacity-50"
                disabled={isLoading}
                onClick={() => setSelected(new Set(CATEGORIES.map(c => c.key)))}
              >
                Select All
              </button>
              <button
                className="text-xs px-2.5 py-1 rounded bg-discord-darker text-discord-light disabled:opacity-50"
                disabled={isLoading}
                onClick={() => setSelected(new Set())}
              >
                Deselect All
              </button>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-2 gap-2 px-6 pb-3">
              {CATEGORIES.map(cat => {
                const isSelected = selected.has(cat.key);
                return (
                  <div
                    key={cat.key}
                    onClick={() => toggleCategory(cat.key)}
                    className={[
                      'relative rounded-lg p-3 cursor-pointer transition-all select-none',
                      'bg-discord-dark border-2',
                      isSelected ? 'border-discord-blurple' : 'border-transparent',
                      isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-discord-darker',
                    ].join(' ')}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-discord-blurple flex items-center justify-center">
                        <span className="text-white text-[9px] font-bold">✓</span>
                      </div>
                    )}
                    <div className="text-xl mb-1">{cat.emoji}</div>
                    <div className="text-white text-xs font-bold mb-0.5">{cat.name}</div>
                    <div className="text-discord-light text-[10px] leading-snug">{cat.desc}</div>
                  </div>
                );
              })}
            </div>

            {/* Warning */}
            <div className="mx-6 mb-4 flex gap-2 items-start p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-yellow-300 leading-snug">
                Channel and role assignments will be cleared where possible — you'll need to reassign them after syncing.
                Scheduled messages and auto-delete channels retain their channel IDs and must be reconfigured manually.
              </p>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-discord-darker">
              <button
                className="text-sm text-discord-light hover:text-white px-4 py-2 rounded disabled:opacity-50"
                disabled={isLoading}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading || selected.size === 0}
                onClick={handleCopy}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Syncing…
                  </>
                ) : (
                  `Copy ${selected.size} ${selected.size === 1 ? 'Category' : 'Categories'} →`
                )}
              </button>
            </div>
          </>
        )}

        {/* Success state */}
        {modalState === 'success' && (
          <div className="px-6 pb-6">
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-green-400" />
              </div>
              <div className="text-green-400 font-semibold">
                {syncedCount} {syncedCount === 1 ? 'category' : 'categories'} synced!
              </div>
              <p className="text-discord-light text-xs text-center">
                Remember to reassign channel and role settings where needed.
              </p>
            </div>
            <div className="flex justify-end">
              <button className="btn btn-secondary text-sm" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {/* Error state */}
        {modalState === 'error' && (
          <div className="px-6 pb-6">
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-red-400" />
              </div>
              <div className="text-red-400 font-semibold text-sm text-center">{errorMsg}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="text-sm text-discord-light hover:text-white px-4 py-2 rounded" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary text-sm" onClick={handleTryAgain}>
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd /home/plex/wall-e-bot/dashboard/frontend && node_modules/.bin/tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  cd /home/plex/wall-e-bot
  git add dashboard/frontend/src/pages/guild/SyncModal.tsx
  git commit -m "feat: add SyncModal with idle/loading/success/error states and category cards"
  ```

---

## Chunk 3: Frontend — Simplify SyncPage.tsx

### Task 3: Wire SyncPage to open the modal

**Files:**
- Modify: `dashboard/frontend/src/pages/guild/SyncPage.tsx`

Remove the `useMutation`, success/error banner state, `handleCopy` function. Keep: guilds query, source dropdown, eligibleSources filter. Add `modalOpen` state and import SyncModal.

- [ ] **Step 1: Replace SyncPage.tsx with simplified version**

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Copy } from 'lucide-react';
import api from '../../api/axios';
import SyncModal from './SyncModal';

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  botPresent: boolean;
}

export default function SyncPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const { data: guilds, isLoading } = useQuery<Guild[]>({
    queryKey: ['guilds'],
    queryFn: async () => {
      const response = await api.get<Guild[]>('/api/guilds');
      return response.data;
    },
  });

  const eligibleSources = guilds?.filter((g) => {
    if (g.id === guildId || !g.botPresent) return false;
    if (g.owner) return true;
    const perms = BigInt(g.permissions);
    const MANAGE_GUILD = BigInt(0x20);
    const ADMINISTRATOR = BigInt(0x8);
    return (perms & MANAGE_GUILD) === MANAGE_GUILD || (perms & ADMINISTRATOR) === ADMINISTRATOR;
  }) ?? [];

  const sourceGuild = guilds?.find(g => g.id === selectedSourceId);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RefreshCw className="w-6 h-6" />
          Sync Settings
        </h1>
        <p className="text-discord-light mt-1">
          Copy settings from another server to this one to save setup time.
        </p>
      </div>

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
              <label htmlFor="source-guild" className="block text-sm font-medium mb-2">
                Copy settings from:
              </label>
              <select
                id="source-guild"
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

            <button
              className="btn btn-primary flex items-center gap-2"
              disabled={!selectedSourceId}
              onClick={() => setModalOpen(true)}
            >
              <Copy className="w-4 h-4" />
              Open Sync Modal
            </button>
          </>
        )}
      </div>

      {modalOpen && selectedSourceId && guildId && (
        <SyncModal
          guildId={guildId}
          sourceGuildId={selectedSourceId}
          sourceName={sourceGuild?.name ?? selectedSourceId}
          onClose={() => {
            setModalOpen(false);
            setSelectedSourceId('');
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd /home/plex/wall-e-bot/dashboard/frontend && node_modules/.bin/tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  cd /home/plex/wall-e-bot
  git add dashboard/frontend/src/pages/guild/SyncPage.tsx
  git commit -m "feat: simplify SyncPage to source picker + modal trigger"
  ```

---

## Chunk 4: Deploy & Verify

### Task 4: Build and deploy to VPS

- [ ] **Step 1: Build frontend locally to catch any Vite/TS errors**

  ```bash
  cd /home/plex/wall-e-bot/dashboard/frontend && node_modules/.bin/vite build
  ```
  Expected: build completes with no errors.

- [ ] **Step 2: Push to GitHub**

  ```bash
  cd /home/plex/wall-e-bot && git push origin main
  ```

- [ ] **Step 3: Deploy to VPS**

  SSH to `root@107.174.93.143` (password: see memory) and run:
  ```bash
  cd /opt/wall-e-bot && git pull && docker compose -f docker/docker-compose.yml build --no-cache && docker compose -f docker/docker-compose.yml up -d && docker compose -f docker/docker-compose.yml exec backend node dist/db/migrate.js
  ```

- [ ] **Step 4: Smoke test on prod**

  1. Open the dashboard → a guild's Sync Settings page
  2. Select a source server → "Open Sync Modal" button becomes enabled
  3. Click it → modal opens with all 6 cards selected
  4. Deselect a card → button label updates to "Copy 5 Categories →"
  5. Click copy → loading state (spinner, cards dimmed)
  6. On success → green checkmark, "N categories synced!" → click Done → modal closes
  7. On error → red icon, actual error message → click Try Again → returns to idle with selections preserved
