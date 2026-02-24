# Ticket System Redesign
**Date:** 2026-02-24
**Status:** Approved

## Overview

Replace the current single-panel, single-config ticket system with a full multi-panel, per-section ticketing system inspired by TicketTool.xyz. Each panel supports multiple ticket types (categories) with independent staff roles, custom forms, channel naming, and close behavior.

---

## Goals

- Support multiple ticket panels per server (e.g. one for #support, one for #appeals)
- Each panel can have multiple ticket types (buttons or dropdown)
- Each ticket type can have a custom modal form with up to 5 questions
- Tickets are archived to a closed category instead of deleted
- Transcripts are auto-saved to a log channel on close
- Custom channel naming with variables
- DM notifications on open and close
- Auto-close on inactivity (background job)
- Thread-style tickets supported per panel

---

## Database Schema

### Extend `ticket_config` (global server settings)
Add columns:
- `transcript_channel_id VARCHAR(20)` — where transcripts are posted on close
- `max_tickets_per_user INTEGER DEFAULT 1`
- `auto_close_hours INTEGER DEFAULT 0` — 0 = disabled
- `welcome_message TEXT`

Remove from `ticket_config`: `channel_id`, `category_id`, `support_role_id`, `panel_title`, `panel_description` (moved to panels/categories)

### New: `ticket_panels`
```sql
CREATE TABLE ticket_panels (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  style VARCHAR(20) DEFAULT 'channel',     -- 'channel' | 'thread'
  panel_type VARCHAR(20) DEFAULT 'buttons', -- 'buttons' | 'dropdown'
  panel_channel_id VARCHAR(20),            -- channel where panel message was sent
  panel_message_id VARCHAR(20),            -- message ID of the sent panel
  category_open_id VARCHAR(20),            -- Discord category for open tickets
  category_closed_id VARCHAR(20),          -- Discord category for closed tickets
  overflow_category_id VARCHAR(20),        -- overflow when category hits 50 channels
  channel_name_template VARCHAR(100) DEFAULT '{type}-{number}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### New: `ticket_categories`
```sql
CREATE TABLE ticket_categories (
  id SERIAL PRIMARY KEY,
  panel_id INTEGER REFERENCES ticket_panels(id) ON DELETE CASCADE,
  guild_id VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  emoji VARCHAR(10),
  description VARCHAR(200),
  support_role_ids TEXT[] DEFAULT '{}',
  observer_role_ids TEXT[] DEFAULT '{}',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### New: `ticket_form_fields`
```sql
CREATE TABLE ticket_form_fields (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES ticket_categories(id) ON DELETE CASCADE,
  label VARCHAR(45) NOT NULL,
  placeholder VARCHAR(100),
  min_length INTEGER DEFAULT 0,
  max_length INTEGER DEFAULT 1024,
  style VARCHAR(10) DEFAULT 'short',   -- 'short' | 'paragraph'
  required BOOLEAN DEFAULT TRUE,
  position INTEGER DEFAULT 0
);
```

### Extend `tickets` table
Add columns:
- `panel_id INTEGER REFERENCES ticket_panels(id)`
- `category_id INTEGER REFERENCES ticket_categories(id)`
- `topic TEXT` — form answers stored as JSON string
- `transcript_message_id VARCHAR(20)`
- `thread_id VARCHAR(20)`
- `last_activity TIMESTAMP DEFAULT NOW()` — for auto-close tracking

---

## Bot Interaction Flow

### Panel Setup
1. `/ticket panel create <name> [style] [type]` — creates panel row
2. Admin configures categories and forms via dashboard
3. `/ticket panel send <panel_id> #channel` — posts panel message to channel, stores `panel_message_id`
4. `/ticket panel update <panel_id>` — re-edits existing panel message after config changes

### User Opens a Ticket
1. User clicks button / selects dropdown option
2. Bot checks: user at `max_tickets_per_user` limit? → ephemeral error
3. If category has form fields → show Discord modal with those fields (up to 5)
4. On modal submit (or direct if no form):
   - Create channel (or thread if style=thread) in `category_open_id`
   - Channel name from template: `{type}`, `{number}`, `{username}`, `{userid}` variables
   - Post welcome embed with form answers + Close button
   - Ping `support_role_ids` in the message
   - DM user: "Your ticket #{number} has been created: #{channel}"
5. Save ticket row with `panel_id`, `category_id`, `topic` (JSON of answers)

### Staff Claims a Ticket
- `/ticket claim` → sets `claimed_by`, posts embed, optionally DMs user

### Ticket Close
1. User or staff clicks Close button → bot replies with two-step confirm embed (Confirm / Cancel buttons)
2. On confirm:
   - Auto-generate transcript (all messages, full history via pagination)
   - Post transcript file to `transcript_channel_id` if configured
   - Rename channel to `closed-{original-name}`
   - Move channel to `category_closed_id`
   - Update DB: `status='closed'`, `closed_by`, `closed_at`, `close_reason`, `transcript_message_id`
   - DM user: "Your ticket has been closed. Reason: {reason}"

### Auto-Close (Background Job)
- `SchedulerService` checks every hour
- Finds open tickets where `last_activity < NOW() - interval '{auto_close_hours} hours'`
- If ticket was already warned: close it
- If not warned yet: post warning message in channel, set `warned_at` timestamp

---

## Dashboard

### Structure
`TicketsPage` gets three tabs:
1. **Panels** — list and manage panels, send to channel
2. **Settings** — global config (transcript channel, max tickets, auto-close, welcome message)
3. **Active Tickets** — live list from API, filter by status/panel/category

### Panel Editor (in Panels tab)
- Lists all panels; click to expand panel editor
- Category list (draggable reorder)
- Each category card: emoji, name, description, staff roles, observer roles
- Expand category → Form Builder (add/remove/reorder fields: label, placeholder, short/paragraph, required)
- Panel settings: open category, closed category, channel name template, style, type

### Backend API Routes
```
GET    /guilds/:id/ticket-config
PUT    /guilds/:id/ticket-config

GET    /guilds/:id/ticket-panels
POST   /guilds/:id/ticket-panels
GET    /guilds/:id/ticket-panels/:panelId
PUT    /guilds/:id/ticket-panels/:panelId
DELETE /guilds/:id/ticket-panels/:panelId

GET    /guilds/:id/ticket-panels/:panelId/categories
POST   /guilds/:id/ticket-panels/:panelId/categories
PUT    /guilds/:id/ticket-categories/:categoryId
DELETE /guilds/:id/ticket-categories/:categoryId

GET    /guilds/:id/ticket-categories/:categoryId/form-fields
POST   /guilds/:id/ticket-categories/:categoryId/form-fields
PUT    /guilds/:id/ticket-form-fields/:fieldId
DELETE /guilds/:id/ticket-form-fields/:fieldId

GET    /guilds/:id/tickets          (query: status, panel_id, category_id)
```

---

## Channel Naming Variables
| Variable | Value |
|---|---|
| `{type}` | category name (lowercased, hyphenated) |
| `{number}` | zero-padded ticket number |
| `{username}` | Discord username |
| `{userid}` | Discord user ID |

---

## Files Touched

### Bot
- `bot/src/commands/admin/ticket.ts` — rewrite with panel subcommands
- `bot/src/events/buttonInteraction.ts` — multi-panel handling, two-step close, modals
- `bot/src/services/DatabaseService.ts` — add ticket panel/category queries
- `bot/src/services/SchedulerService.ts` — add auto-close job

### DB Migration
- `dashboard/backend/src/db/migrate.ts` — new tables, alter existing

### Dashboard Backend
- `dashboard/backend/src/routes/guilds.ts` — add ticket API routes
- `dashboard/backend/src/services/guildConfigService.ts` — ticket config methods

### Dashboard Frontend
- `dashboard/frontend/src/pages/guild/TicketsPage.tsx` — full rewrite
- `dashboard/frontend/src/services/api.ts` — add ticket API calls

### Shared
- `shared/src/types/guild.ts` — add TicketPanel, TicketCategory, TicketFormField types
