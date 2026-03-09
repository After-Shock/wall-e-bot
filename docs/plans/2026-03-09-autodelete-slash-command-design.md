# Auto-Delete Slash Command Design

**Date:** 2026-03-09
**Status:** Approved

## Goal

Add a top-level `/auto-delete` slash command to the bot so guild admins can manage auto-delete channel configs without using the dashboard.

## Architecture

- Single new file: `bot/src/commands/admin/autodelete.ts`
- Direct PostgreSQL queries via `DatabaseService` (matches scheduler pattern)
- No new services or abstractions

## Command Structure

Permission: `ManageGuild`. All replies ephemeral.

| Subcommand | Options | Behavior |
|---|---|---|
| `add` | `channel` (required), `max-age-hours` (optional int), `max-messages` (optional int) | Creates config; requires at least one limit; errors if already exists |
| `edit` | `channel` (required), `max-age-hours` (optional int), `max-messages` (optional int) | Updates config; requires at least one field; errors if not found |
| `remove` | `channel` (required) | Deletes config; errors if not found |
| `toggle` | `channel` (required) | Flips `enabled` boolean; reports new state |
| `list` | *(none)* | Embed listing all configured channels |

## Validation

- `max-age-hours`: integer 1–8760
- `max-messages`: integer 1–10000
- `add`: at least one of `max-age-hours` or `max-messages` required
- `edit`: at least one field required; channel must exist
- `remove`/`toggle`: channel must exist in config

## Error Messages

- Channel already configured → "Channel already configured. Use `/auto-delete edit` to update it."
- Channel not found → "No auto-delete config found for that channel."
- No fields on edit → "Provide at least one field to update."
- No configs on list → "No auto-delete channels configured. Use `/auto-delete add` to get started."

## List Output Format

Embed with one line per config:

```
🗑️ Auto-Delete Channels

#general       Age: 24h | Messages: 500 | ✅ Enabled
#spam          Age: —   | Messages: 100 | ✅ Enabled
#announcements Age: 72h | Messages: —   | ❌ Disabled

Exempt roles are managed via the dashboard.
```

- Channels shown as mentions (`<#channel_id>`)
- `—` for unset limits
- Footer note about exempt roles (dashboard-only)

## Out of Scope

- Exempt roles (dashboard-only)
- Per-command cooldowns (ManageGuild users are trusted)
