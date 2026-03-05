# Role-Based Dashboard Access — Design Document

## Goal

Allow server admins to grant dashboard access to any Discord role, so non-admin members (e.g. moderators) can manage the bot without needing MANAGE_GUILD.

## Scope

- DB: one new table (`dashboard_roles`)
- Backend: async `requireGuildAccess`, new dashboard-roles routes, guild roles endpoint, updated guild list
- Frontend: "Dashboard Access" card in Settings tab, guild list shows all mutual guilds

---

## DB

```sql
CREATE TABLE IF NOT EXISTS dashboard_roles (
  guild_id VARCHAR(20) NOT NULL,
  role_id  VARCHAR(20) NOT NULL,
  PRIMARY KEY (guild_id, role_id)
);
```

---

## Backend

### `requireGuildAccess` (middleware/auth.ts)

Becomes async. New flow:

1. If user has MANAGE_GUILD, ADMINISTRATOR, or is owner → allow (existing)
2. Fetch `dashboard_roles` for this guild from DB
3. If no rows → deny (403)
4. Call Discord API with bot token: `GET /guilds/:guildId/members/:userId`
5. If member has any configured role → allow
6. Else → deny

Bot token read from `process.env.DISCORD_TOKEN`.

### New routes: `dashboard/backend/src/routes/dashboardRoles.ts`

Mounted at `/api/guilds/:guildId/dashboard-roles`. All routes require `requireAuth` + `requireGuildAccess` (MANAGE_GUILD check only — role-based users cannot edit the access list).

Actually: the add/remove routes need to require MANAGE_GUILD specifically (not role-based access), since role-based users should not be able to grant themselves or others access. We'll add a `requireGuildAdmin` middleware that only checks MANAGE_GUILD/ADMINISTRATOR (no role fallback).

- `GET /` — return array of `{ roleId, roleName }` (role names fetched from Discord)
- `POST /` — body `{ roleId }` — insert row, return updated list
- `DELETE /:roleId` — delete row, return updated list

### New route: `GET /api/guilds/:guildId/roles`

Returns all roles in the guild from Discord API (bot token). Used to populate the add-role dropdown.

### Guild list (`/api/guilds` or user guilds endpoint)

Change to return all guilds where:
- User is a member (from Discord OAuth `guilds` scope)
- Bot is in the guild (guild_id exists in `guild_whitelist` with status = 'approved')

Remove the MANAGE_GUILD filter from the guild list — access is gated by `requireGuildAccess` when opening a guild.

---

## Shared Types (`shared/src/types/guild.ts`)

```typescript
export interface DashboardRole {
  roleId: string;
  roleName: string;
}
```

---

## Frontend

### Guild list

Update to show all mutual guilds (not just MANAGE_GUILD). The sidebar/list already fetches from Discord; remove the permission filter or change the backend to return all mutual guilds.

### Settings tab — "Dashboard Access" card

Only rendered when the current user has MANAGE_GUILD (admin users only).

- Heading: "Dashboard Access"
- Description: "Allow members with these roles to access this server's dashboard."
- Role list: each row shows role name + colored role dot + "Remove" button
- "Add Role" dropdown: fetches all guild roles, excludes already-added ones, select → POST
- Empty state: "No roles configured. Only server admins can access the dashboard."

---

## Files Changed

- `dashboard/backend/src/db/migrate.ts` — create `dashboard_roles` table
- `dashboard/backend/src/middleware/auth.ts` — async `requireGuildAccess` with role fallback, new `requireGuildAdmin`
- `dashboard/backend/src/routes/dashboardRoles.ts` — new file
- `dashboard/backend/src/routes/index.ts` — register dashboard-roles router
- `shared/src/types/guild.ts` — `DashboardRole` type
- `dashboard/frontend/src/pages/GuildPage.tsx` — "Dashboard Access" settings card, updated guild list logic
