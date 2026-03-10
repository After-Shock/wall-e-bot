# Hidden Nav Items Design

**Date:** 2026-03-10
**Status:** Approved

## Goal

Allow each dashboard user to hide sidebar nav items they don't use, persisted per-user in the database.

## Schema Changes

### `users` table

Add a `preferences` JSONB column:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}';
```

Hidden nav items stored as:

```json
{ "hidden_nav": ["Starboard", "Triggers", "Suggestions"] }
```

Items are identified by their `name` string matching the `name` field in `getNavItems()` in `Sidebar.tsx`.

## API Endpoints

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/me/preferences` | Returns `{ hidden_nav: string[] }` for authenticated user |
| `PATCH` | `/api/me/preferences` | Accepts `{ hidden_nav: string[] }`, merges into `preferences` JSONB, returns updated preferences |

Auth-gated via existing session middleware. No guild scoping — global per user.

## Dashboard UX (Sidebar)

### Edit mode toggle

The sidebar "Server Settings" header row gains a small pencil icon button on the right. Clicking it enters edit mode; clicking again (or a "Done" button) exits.

### In edit mode

- Each visible nav item shows an eye-off icon on the right — clicking hides that item immediately
- Hidden items move to a **"Hidden" section** at the bottom of the sidebar, grayed out, each with a restore (eye) icon
- Changes save on each toggle via `PATCH /api/me/preferences` (no explicit save button)

### Normal mode

- Hidden items are not rendered
- The "Hidden" section is not shown
- The pencil edit button remains visible

### Data flow

- Sidebar fetches `GET /api/me/preferences` via TanStack Query key `['me-preferences']`
- Nav list is filtered by `hidden_nav` before rendering
- Toggle handler: optimistic update to query cache + `PATCH /api/me/preferences`

## Out of Scope

- Hiding child nav items independently (only top-level items can be hidden)
- Per-guild nav preferences
- Reordering nav items
