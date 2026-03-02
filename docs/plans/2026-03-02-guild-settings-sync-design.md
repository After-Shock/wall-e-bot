# Guild Settings Sync — Design Doc

**Date:** 2026-03-02
**Status:** Approved

## Overview

Allow users to copy settings from one Discord guild to another directly from the dashboard, saving setup time when running the bot in multiple servers.

## Use Case

A user runs Wall-E Bot in multiple Discord guilds. They have spent time configuring one guild (automod rules, moderation settings, leveling config, etc.) and want to apply the same configuration to a new guild without re-doing all the work manually.

## Approach

One-time copy (not live sync). The user explicitly triggers a copy from a source guild to the current target guild. After the copy, both guilds are independent.

## Backend

### New Endpoint

`POST /api/guilds/:targetGuildId/copy-from/:sourceGuildId`

**Middleware:**
- `requireAuth`
- `requireGuildAccess` on `targetGuildId` (existing middleware — verifies user has MANAGE_GUILD or owner in target)
- Inline check: verify user's session guilds include `sourceGuildId` with MANAGE_GUILD or owner permission

**Logic:**
1. Fetch `config` from `guild_configs WHERE guild_id = $sourceGuildId`
2. Return 404 if source has no config
3. Deep-clone the config object
4. Strip server-specific IDs using a recursive utility function that nulls any key matching `*ChannelId` or `*RoleId` (case-insensitive)
5. Upsert cleaned config into `guild_configs` for `targetGuildId`
6. Return `{ success: true, config: cleanedConfig }`

**Fields stripped (examples from current GuildConfig type):**
- `moderation.muteRoleId`
- `moderation.modLogChannelId`
- `welcome.channelId`
- Any other fields ending in `ChannelId` or `RoleId`

**File:** `dashboard/backend/src/routes/guilds.ts`

### Helper Utility

`stripServerSpecificIds(config: object): object`
Recursively traverses config, returning a new object with all keys matching `/channelid$|roleid$/i` set to `undefined`/`null`.

**File:** `dashboard/backend/src/utils/stripServerIds.ts`

## Frontend

### New Page

**File:** `dashboard/frontend/src/pages/guild/SyncPage.tsx`
**Route:** `/dashboard/:guildId/sync`

**UI Structure:**
1. Page header: "Sync Settings" with description
2. "Copy From Another Server" card:
   - Dropdown/select listing the user's other guilds where the bot is present (filtered from existing `/api/guilds` response, excluding current guild)
   - Yellow warning banner: "This will overwrite ALL current settings. Channel and role assignments will be cleared and must be reconfigured."
   - "Copy Settings" button → POST to the new endpoint → success/error toast notification
3. On success: invalidate React Query cache for the target guild config

### Routing

Add to `App.tsx`:
```tsx
<Route path="sync" element={<SyncPage />} />
```

### Sidebar

Add "Sync" navigation item to the sidebar, placed near the existing Backup entry (under Settings or as a standalone item).

**File:** `dashboard/frontend/src/components/Sidebar.tsx`

## Authorization Rules

| Action | Requirement |
|--------|-------------|
| Read source config | User must have MANAGE_GUILD or owner in source guild |
| Write target config | User must have MANAGE_GUILD or owner in target guild (enforced by `requireGuildAccess`) |

Both checks must pass. If the user doesn't have access to the source, return 403.

## Error Cases

| Case | Response |
|------|----------|
| Source guild has no config | 404 "Source server has no configuration" |
| User lacks source guild access | 403 "You don't have permission to access the source server" |
| Source and target are the same | 400 "Cannot copy to the same server" |
| DB error | 500 with logged error |

## What Is NOT Included

- Live/ongoing sync between guilds
- Config templates or named presets
- Export/import to file
- Selective section copying (copy only moderation, etc.)

These can be added in future iterations if needed.
