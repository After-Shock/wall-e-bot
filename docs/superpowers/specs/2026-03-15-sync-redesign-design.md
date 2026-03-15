# Sync Settings Redesign

**Date:** 2026-03-15
**Status:** Approved

## Overview

Replace the current one-click "copy everything" sync flow with a modal that lets admins choose which categories to sync, while keeping dependent items grouped to avoid bot breakage.

## UI Design

### SyncPage changes

- Remove the existing inline form (source dropdown + copy button + success/error banners).
- Keep the source server dropdown on the page.
- Add an "Open Sync Modal" button that is disabled until a source server is selected.

### SyncModal component (`SyncModal.tsx`)

New modal with three internal states:

**Idle state**
- Header: "Sync Settings" + subtitle showing "Copying from [Source] → this server"
- "Select All" and "Deselect All" buttons
- 6 category cards in a 2-column grid, all pre-selected by default
- Each card: emoji, name, short description of what it contains, blue border + checkmark when selected
- Warning banner: "Channel and role assignments will be cleared where possible — you'll need to reassign them after syncing. Scheduled messages and auto-delete channels retain their channel IDs and must be reconfigured manually."
- Footer: Cancel button + "Copy N Categories →" button (N updates as cards are toggled)

**Loading state**
- Cards dim and become non-interactive
- Footer button shows spinner + "Syncing…", disabled
- Modal cannot be closed during sync

**Result state**
- Success: green checkmark icon, "N categories synced!" (N = count of categories that had data; categories with zero source rows are silently skipped and not counted), reminder to reassign channels/roles, "Done" button dismisses modal and invalidates guild config query cache
- Error: red icon, actual error message from server (never a generic fallback), "Try Again" button returns to idle state with selections preserved

### Category cards

| Card | Emoji | Description shown |
|---|---|---|
| General | ⚙️ | Welcome, leveling, starboard, prefix |
| Moderation | 🛡️ | Logging, automod, spam, word filters, link protection |
| Custom Commands | 🤖 | Commands & groups, triggers, responses |
| Roles | 🎭 | Auto roles (reaction roles not copied — see backend notes) |
| Tickets | 🎫 | Panels, categories, forms, ticket config |
| Automation | ⏰ | Scheduled messages, auto-delete channels |

## Backend Design

### Endpoint

`POST /api/guilds/:guildId/copy-from/:sourceGuildId`

**Request body change:** add `categories: string[]` — array of selected category keys from the set `["general", "moderation", "commands", "roles", "tickets", "automation"]`. If omitted or empty, return 400.

### Category → table mapping

| Category key | Tables written | Notes |
|---|---|---|
| `general` | `guild_configs` (non-moderation sections) | Merged with `moderation` if both selected |
| `moderation` | `guild_configs` (moderation/automod/logging/spam/wordfilter/linkprotection sections) | Merged with `general` if both selected |
| `commands` | `command_groups`, `custom_commands` | FK remapping required — see insert strategy |
| `roles` | `auto_roles` only | `reaction_roles` and `reaction_role_messages` are **not copied** — their `message_id`/`channel_id` columns are `NOT NULL` and reference server-specific Discord message IDs that cannot be transferred. These rows are silently dropped. |
| `tickets` | `ticket_config`, `ticket_panel_groups`, `ticket_panels`, `ticket_categories`, `ticket_form_fields` | FK remapping required — see insert strategy and write order |
| `automation` | `scheduled_messages`, `auto_delete_channels` | Rows are copied with `channel_id` preserved (server-specific but `NOT NULL` — cannot be nulled). Admin must reassign channels after sync. |

**Note on `general` and `moderation`:** Both live in `guild_configs`. If either or both are selected, the config is fetched once, sections are merged selectively, and written in one upsert. `stripServerIds` handles nulling all `*_channel_id` and `*_role_id` keys within the JSON.

### Transaction

All selected category writes execute inside a **single DB transaction** using a dedicated client acquired from the pool (`db.connect()`). The implementation must:
1. Call `client.query('BEGIN')`
2. Execute all writes on the same `client` instance
3. Call `client.query('COMMIT')` on success
4. Call `client.query('ROLLBACK')` on any error, then re-throw
5. Release the client in a `finally` block

Pool-level `db.query()` calls must not be used inside the transaction — they may resolve on different pool clients and will not participate in the transaction.

### Insert strategy

Two patterns are used depending on whether FK remapping is required:

**Flat tables** (`auto_roles`, `guild_configs`, `ticket_config`, `scheduled_messages`, `auto_delete_channels`): use a single `INSERT INTO target SELECT ... FROM source WHERE guild_id = $sourceGuildId` query per table, with `ON CONFLICT (guild_id) DO UPDATE` where applicable.

**FK-remapping tables** (`command_groups`→`custom_commands`, `ticket_panel_groups`→`ticket_panels`→`ticket_categories`→`ticket_form_fields`): use sequential inserts with `RETURNING id` to capture new IDs, building an in-process map (old ID → new ID) used to rewrite FK columns in child rows. CTEs with `RETURNING` are an acceptable alternative if the implementer prefers a single-query approach.

This avoids the nginx 60s proxy timeout that breaks the current per-row loop approach.

### Fields cleared on copy

- `allowed_roles`, `allowed_channels` arrays → `'{}'` (empty array)
- `interval_channel_id`, `reaction_channel_id`, `reaction_message_id` in `custom_commands` → `NULL`
- All `*_channel_id` and `*_role_id` keys inside the `guild_configs` JSON blob → `NULL` (via existing `stripServerIds`)
- `scheduled_messages.channel_id` and `auto_delete_channels.channel_id`: preserved as-is (NOT NULL constraint; admin must reassign after sync)

### Atomicity rules

- **Tickets** are always written as a unit, in FK dependency order: `ticket_config` (independent), then `ticket_panel_groups` → `ticket_panels` → `ticket_categories` → `ticket_form_fields`. The UI presents this as one card with no sub-checkboxes.
- **Commands** are always written as a unit: `command_groups` first (capturing new IDs), then `custom_commands` with `group_id` remapped. One card.
- A category with zero source rows is a silent no-op — not an error. The success message counts only categories where at least one row was written.

### Error responses

| Condition | HTTP | Message |
|---|---|---|
| No categories selected / empty array | 400 | "Select at least one category to sync" |
| Same source and target | 400 | "Cannot copy settings to the same server" |
| No permission on source | 403 | "You don't have permission to access the source server" |
| Source has no guild_configs row | 404 | "Source server has no configuration" |
| DB error | 500 | Actual DB error message (not a generic fallback) |

## Data Flow

1. User selects source server on SyncPage → "Open Sync Modal" button enables
2. Modal opens → all 6 cards pre-selected
3. User deselects unwanted cards → button label updates to "Copy N Categories"
4. User clicks copy → modal enters loading state → `POST copy-from` fires with `categories` array
5. On success → modal shows success state with count of categories that had data → user clicks "Done" → modal closes, TanStack Query cache for `['guild', guildId]` invalidated
6. On error → modal shows actual server error message with "Try Again" → returns to idle with prior selections intact

## Files Affected

- `dashboard/frontend/src/pages/guild/SyncPage.tsx` — simplify to source picker + modal trigger
- `dashboard/frontend/src/pages/guild/SyncModal.tsx` — new component (all modal logic)
- `dashboard/backend/src/routes/guilds.ts` — update copy-from handler
