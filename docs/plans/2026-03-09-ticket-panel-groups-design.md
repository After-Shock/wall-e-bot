# Ticket Panel Groups Design

**Date:** 2026-03-09
**Status:** Approved

## Goal

Replace the fragile string-based `stack_group` system with first-class group objects, add visual drag-to-reorder within groups, and enable sending/re-sending stacked panel messages directly from the dashboard.

## Schema Changes

### New table: `ticket_panel_groups`

```sql
CREATE TABLE ticket_panel_groups (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  last_channel_id VARCHAR(20),
  last_message_id VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `ticket_panels` changes

- Add `group_id INTEGER REFERENCES ticket_panel_groups(id) ON DELETE SET NULL`
- Drop `stack_group VARCHAR(50)` (replaced by FK)
- Keep `stack_position INTEGER` (order within group; irrelevant for ungrouped panels)

## API Endpoints

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/guilds/:guildId/ticket-panel-groups` | Create group |
| `PUT` | `/api/guilds/:guildId/ticket-panel-groups/:groupId` | Rename group |
| `DELETE` | `/api/guilds/:guildId/ticket-panel-groups/:groupId` | Disband group (nulls group_id on panels) |
| `PUT` | `/api/guilds/:guildId/ticket-panels/:panelId/group` | Assign/remove panel from group, set stack_position |
| `POST` | `/api/guilds/:guildId/ticket-panel-groups/:groupId/send` | Send or re-send group to Discord channel |
| `POST` | `/api/guilds/:guildId/ticket-panels/:panelId/send` | Send single ungrouped panel to Discord channel |

Existing panel CRUD endpoints (`GET /ticket-panels`, `PUT /ticket-panels/:panelId`, etc.) remain unchanged. `GET /ticket-panels` response gains `group_id` and `stack_position` fields; groups returned separately via `GET /ticket-panel-groups`.

## Dashboard UX (Panels Tab)

### Groups section (top)

Each group renders as a container card:
- Group name — inline editable
- Panels within it as draggable rows (drag handle updates `stack_position`)
- Each panel row: expand to edit (same editor as today) + "Remove from group" button
- "Send to Channel" button → channel picker modal → posts or edits Discord message
  - Shows "Re-send" + defaults to `last_channel_id` if previously sent
  - Edits existing message (PATCH) if `last_message_id` set; otherwise posts new
- "Delete Group" button — disbands group, panels drop to Ungrouped section

### Ungrouped Panels section (below)

- Same expandable panel cards as today
- Each has "Add to Group" button → dropdown of existing groups or "Create new group"
- Each ungrouped panel has its own "Send to Channel" button

### Create Group

Top-level "+ New Group" button — creates named group, panels can be dragged in immediately.

## Discord Posting Logic (Backend)

Backend calls Discord REST API directly using `DISCORD_TOKEN` (same token the bot uses).

**Send flow:**
1. Fetch all panels in group ordered by `stack_position`, with their categories
2. Build ActionRow components:
   - `panel_type='buttons'` → one button per category (`ticket_open:{panelId}:{categoryId}`)
   - `panel_type='dropdown'` → one select menu per panel (`ticket_select:{panelId}`)
3. If `last_message_id` exists → PATCH Discord message (edit in place)
4. Otherwise → POST new message to channel
5. Save `last_channel_id` + `last_message_id` on group; save `panel_channel_id` + `panel_message_id` on each panel

**Single panel send:** same logic, scoped to one panel.

## Bot Changes

`/ticket panel send` command updated to query siblings via `group_id` instead of `stack_group`. Behavior otherwise identical.

## Out of Scope

- Drag-and-drop between groups (use "Add to Group" instead)
- Panel send history / audit log
- Inline preview of what the Discord message will look like
