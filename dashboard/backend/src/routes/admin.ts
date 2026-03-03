import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireBotOwner } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';

export const adminRouter = Router();

// All admin routes require auth + bot owner
adminRouter.use(requireAuth, requireBotOwner);

// GET /api/admin/stats — overall bot stats
adminRouter.get('/stats', asyncHandler(async (req, res) => {
  const [guilds, users, pending] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM guild_whitelist WHERE left_at IS NULL`),
    db.query(`SELECT COUNT(*) FROM guild_members`),
    db.query(`SELECT COUNT(*) FROM guild_whitelist WHERE status = 'pending' AND left_at IS NULL`),
  ]);
  res.json({
    totalGuilds: parseInt(guilds.rows[0].count),
    totalUsers: parseInt(users.rows[0].count),
    pendingGuilds: parseInt(pending.rows[0].count),
  });
}));

// GET /api/admin/guilds — list all guilds with status
adminRouter.get('/guilds', asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT guild_id, guild_name, guild_icon, member_count, status, added_at, approved_at, left_at
     FROM guild_whitelist
     ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, added_at DESC`
  );
  res.json(result.rows.map(r => ({
    id: r.guild_id,
    name: r.guild_name,
    icon: r.guild_icon,
    memberCount: r.member_count,
    status: r.status,
    addedAt: r.added_at,
    approvedAt: r.approved_at,
    leftAt: r.left_at,
  })));
}));

// POST /api/admin/guilds/:guildId/approve
adminRouter.post('/guilds/:guildId/approve', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  await db.query(
    `UPDATE guild_whitelist SET status = 'approved', approved_at = NOW() WHERE guild_id = $1`,
    [guildId]
  );
  logger.info(`Admin approved guild ${guildId}`);
  res.json({ success: true });
}));

// POST /api/admin/guilds/:guildId/blacklist
adminRouter.post('/guilds/:guildId/blacklist', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  await db.query(
    `UPDATE guild_whitelist SET status = 'blacklisted' WHERE guild_id = $1`,
    [guildId]
  );
  // Tell bot to leave via Discord API
  const leaveRes = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  logger.info(`Admin blacklisted guild ${guildId}, bot leave: ${leaveRes.status}`);
  res.json({ success: true });
}));

// DELETE /api/admin/guilds/:guildId — leave guild (keep as approved)
adminRouter.delete('/guilds/:guildId', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  logger.info(`Admin left guild ${guildId}`);
  res.json({ success: true });
}));
