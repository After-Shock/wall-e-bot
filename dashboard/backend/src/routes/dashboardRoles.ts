import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess, requireGuildAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const dashboardRolesRouter = Router({ mergeParams: true });

const DISCORD_API = 'https://discord.com/api/v10';

function botHeaders() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('Bot token not configured');
  return { Authorization: `Bot ${token}` };
}

// GET /api/guilds/:guildId/dashboard-roles
dashboardRolesRouter.get('/', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;

  const result = await db.query(
    'SELECT role_id FROM dashboard_roles WHERE guild_id = $1 ORDER BY role_id',
    [guildId],
  );

  if (result.rows.length === 0) {
    res.json([]);
    return;
  }

  let roleNameMap: Record<string, string> = {};
  try {
    const rolesRes = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, { headers: botHeaders() });
    if (rolesRes.ok) {
      const roles = await rolesRes.json() as { id: string; name: string }[];
      roleNameMap = Object.fromEntries(roles.map(r => [r.id, r.name]));
    }
  } catch {
    // Names fall back to role ID
  }

  res.json(result.rows.map((r: { role_id: string }) => ({
    roleId: r.role_id,
    roleName: roleNameMap[r.role_id] ?? r.role_id,
  })));
}));

// POST /api/guilds/:guildId/dashboard-roles
dashboardRolesRouter.post('/', requireAuth, requireGuildAdmin, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const { roleId } = req.body;

  if (!roleId || typeof roleId !== 'string' || !/^\d+$/.test(roleId)) {
    res.status(400).json({ error: 'Invalid roleId' });
    return;
  }

  await db.query(
    'INSERT INTO dashboard_roles (guild_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [guildId, roleId],
  );

  const result = await db.query(
    'SELECT role_id FROM dashboard_roles WHERE guild_id = $1 ORDER BY role_id',
    [guildId],
  );

  let roleNameMap: Record<string, string> = {};
  try {
    const rolesRes = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, { headers: botHeaders() });
    if (rolesRes.ok) {
      const roles = await rolesRes.json() as { id: string; name: string }[];
      roleNameMap = Object.fromEntries(roles.map(r => [r.id, r.name]));
    }
  } catch { /* ignore */ }

  res.json(result.rows.map((r: { role_id: string }) => ({
    roleId: r.role_id,
    roleName: roleNameMap[r.role_id] ?? r.role_id,
  })));
}));

// DELETE /api/guilds/:guildId/dashboard-roles/:roleId
dashboardRolesRouter.delete('/:roleId', requireAuth, requireGuildAdmin, asyncHandler(async (req, res) => {
  const { guildId, roleId } = req.params;

  await db.query(
    'DELETE FROM dashboard_roles WHERE guild_id = $1 AND role_id = $2',
    [guildId, roleId],
  );

  const result = await db.query(
    'SELECT role_id FROM dashboard_roles WHERE guild_id = $1 ORDER BY role_id',
    [guildId],
  );

  let roleNameMap: Record<string, string> = {};
  try {
    const rolesRes = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, { headers: botHeaders() });
    if (rolesRes.ok) {
      const roles = await rolesRes.json() as { id: string; name: string }[];
      roleNameMap = Object.fromEntries(roles.map(r => [r.id, r.name]));
    }
  } catch { /* ignore */ }

  res.json(result.rows.map((r: { role_id: string }) => ({
    roleId: r.role_id,
    roleName: roleNameMap[r.role_id] ?? r.role_id,
  })));
}));
