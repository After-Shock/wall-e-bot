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
- Warning banner: "Channel and role assignments will be cleared — they reference IDs specific to each server."
- Footer: Cancel button + "Copy N Categories →" button (N updates as cards are toggled)

**Loading state**
- Cards dim and become non-interactive
- Footer button shows spinner + "Syncing…", disabled
- Modal cannot be closed during sync

**Result state**
- Success: green checkmark icon, "All N categories synced!", reminder to reassign channels/roles, "Done" button dismisses modal and invalidates guild config query cache
- Error: red icon, actual error message from server (never a generic fallback), "Try Again" button returns to idle state with selections preserved

### Category cards

| Card | Emoji | Description shown |
|---|---|---|
| General | ⚙️ | Welcome, leveling, starboard, prefix |
| Moderation | 🛡️ | Logging, automod, spam, word filters, link protection |
| Custom Commands | 🤖 | Commands & groups, triggers, responses |
| Roles | 🎭 | Auto roles, reaction roles |
| Tickets | 🎫 | Panels, categories, forms, ticket config |
| Automation | ⏰ | Scheduled messages, auto-delete channels |

## Backend Design

### Endpoint

`POST /api/guilds/:guildId/copy-from/:sourceGuildId`

**Request body change:** add `categories: string[]` — array of selected category keys from the set `["general", "moderation", "commands", "roles", "tickets", "automation"]`. If omitted or empty, return 400.

### Category → table mapping

| Category key | Tables written |
|---|---|
| `general` | `guild_configs` (non-moderation sections) |
| `moderation` | `guild_configs` (moderation/automod/logging/spam/wordfilter/linkprotection sections) |
| `commands` | `command_groups`, `custom_commands` |
| `roles` | `auto_roles`, `reaction_roles`, `reaction_role_messages` |
| `tickets` | `ticket_config`, `ticket_panel_groups`, `ticket_panels`, `ticket_categories`, `ticket_form_fields` |
| `automation` | `scheduled_messages`, `auto_delete_channels` |

**Note:** `general` and `moderation` both live in `guild_configs`. If either or both are selected, the config is fetched once, sections are merged selectively, and written in one upsert.

### Transaction

All selected category writes execute inside a single DB transaction. Any failure rolls back everything and returns the DB error message to the client.

### Batch inserts

Replace per-row loops with batch `INSERT ... SELECT` queries (copy directly from source guild to target guild in one query per table). This avoids the nginx 60s proxy timeout that currently breaks the sync.

### Fields cleared on copy

All values referencing server-specific Discord IDs are nulled/emptied:
- `allowed_roles`, `allowed_channels` → `'{}'`
- `interval_channel_id`, `reaction_channel_id`, `reaction_message_id` → `NULL`
- Any `*_channel_id`, `*_role_id` fields in `guild_configs` → `NULL` (via existing `stripServerIds`)

### Atomicity rules

- **Tickets** are always written as a unit (`ticket_panel_groups` → `ticket_panels` → `ticket_categories` → `ticket_form_fields` → `ticket_config`), in dependency order. The UI presents this as one card.
- **Commands** are always written as a unit (`command_groups` first, then `custom_commands` with remapped `group_id`). One card.

### Error responses

| Condition | HTTP | Message |
|---|---|---|
| No categories selected | 400 | "Select at least one category to sync" |
| Same source and target | 400 | "Cannot copy settings to the same server" |
| No permission on source | 403 | "You don't have permission to access the source server" |
| Source has no config | 404 | "Source server has no configuration" |
| DB error | 500 | Actual DB error message (not a generic fallback) |

## Data Flow

1. User selects source server on SyncPage → "Open Sync Modal" enables
2. Modal opens → all 6 cards pre-selected
3. User deselects unwanted cards → button label updates to "Copy N Categories"
4. User clicks copy → modal enters loading state → `POST copy-from` fires with `categories` array
5. On success → modal shows success state → user clicks "Done" → modal closes, TanStack Query cache for `['guild', guildId]` invalidated
6. On error → modal shows error message with "Try Again" → returns to idle with prior selections intact

## Files Affected

- `dashboard/frontend/src/pages/guild/SyncPage.tsx` — simplify to source picker + modal trigger
- `dashboard/frontend/src/pages/guild/SyncModal.tsx` — new component (all modal logic)
- `dashboard/backend/src/routes/guilds.ts` — update copy-from handler
