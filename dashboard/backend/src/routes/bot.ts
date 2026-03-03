import { Router } from 'express';
import axios from 'axios';
import { requireAuth, requireGuildAccess, AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { db } from '../db/index.js';

export const botRouter = Router();

const DISCORD_API = 'https://discord.com/api/v10';

function botHeaders() {
  const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('Bot token not configured');
  return { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
}

// Get bot info
botRouter.get('/info', asyncHandler(async (req, res) => {
  try {
    // This would typically fetch from the bot via IPC or a shared database
    res.json({
      name: 'Wall-E Bot',
      version: '1.0.0',
      description: 'A feature-rich Discord bot with moderation, leveling, and more!',
      inviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands`,
    });
  } catch (error) {
    logger.error('Error fetching bot info:', error);
    res.status(500).json({ error: 'Failed to fetch bot info' });
  }
}));

// Get bot stats
botRouter.get('/stats', asyncHandler(async (req, res) => {
  try {
    // In production, this would query the actual bot stats
    res.json({
      guilds: 0,
      users: 0,
      commands: 12,
      uptime: Date.now(),
    });
  } catch (error) {
    logger.error('Error fetching bot stats:', error);
    res.status(500).json({ error: 'Failed to fetch bot stats' });
  }
}));

// Get bot activity status (global)
botRouter.get('/activity', requireAuth, asyncHandler(async (req, res) => {
  const result = await db.query("SELECT value FROM bot_settings WHERE key = 'activity'");
  const data = result.rows[0]?.value || { type: 'PLAYING', text: '' };
  res.json(data);
}));

// Set bot activity status (global — shows in Discord's status bar)
botRouter.patch('/activity', requireAuth, asyncHandler(async (req, res) => {
  const { type, text } = req.body;
  const validTypes = ['PLAYING', 'WATCHING', 'LISTENING', 'COMPETING'];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    return;
  }
  if (text && typeof text !== 'string') {
    res.status(400).json({ error: 'text must be a string' });
    return;
  }
  await db.query(
    `INSERT INTO bot_settings (key, value) VALUES ('activity', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify({ type, text: text || '' })],
  );
  logger.info('Bot activity updated', { type, text });
  res.json({ success: true });
}));

// Update bot nickname for a guild (per-server, not global)
botRouter.patch('/guilds/:guildId/nickname', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  try {
    const { guildId } = req.params;
    const { nickname } = req.body;

    if (nickname !== undefined && nickname !== null && typeof nickname !== 'string') {
      res.status(400).json({ error: 'nickname must be a string or null' });
      return;
    }
    if (nickname && nickname.length > 32) {
      res.status(400).json({ error: 'Nickname must be 32 characters or fewer' });
      return;
    }

    // PATCH /guilds/{guildId}/members/@me — sets bot's own nickname in this guild
    await axios.patch(
      `${DISCORD_API}/guilds/${guildId}/members/@me`,
      { nick: nickname || null },
      { headers: botHeaders() },
    );

    logger.info('Bot nickname updated', { guildId, nickname });
    res.json({ success: true, nickname: nickname || null });
  } catch (error: any) {
    const discordMsg = error?.response?.data?.message;
    logger.error('Error updating bot nickname:', { error: discordMsg || error });
    res.status(error?.response?.status || 500).json({
      error: discordMsg || 'Failed to update nickname',
    });
  }
}));

// Update bot avatar (global — applies across all servers)
botRouter.patch('/avatar', requireAuth, asyncHandler(async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      res.status(400).json({ error: 'imageUrl is required' });
      return;
    }

    // Validate it looks like a URL
    let parsed: URL;
    try { parsed = new URL(imageUrl); } catch {
      res.status(400).json({ error: 'imageUrl must be a valid URL' });
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      res.status(400).json({ error: 'imageUrl must use http or https' });
      return;
    }

    // Fetch the image
    const imageRes = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      maxContentLength: 8 * 1024 * 1024, // 8MB Discord limit
    });

    const contentType = imageRes.headers['content-type'] || 'image/png';
    if (!contentType.startsWith('image/')) {
      res.status(400).json({ error: 'URL does not point to an image' });
      return;
    }

    const base64 = Buffer.from(imageRes.data).toString('base64');
    const dataUri = `data:${contentType};base64,${base64}`;

    // PATCH /users/@me — sets bot's global avatar
    await axios.patch(
      `${DISCORD_API}/users/@me`,
      { avatar: dataUri },
      { headers: botHeaders() },
    );

    logger.info('Bot avatar updated');
    res.json({ success: true });
  } catch (error: any) {
    const discordMsg = error?.response?.data?.message;
    logger.error('Error updating bot avatar:', { error: discordMsg || error });
    res.status(error?.response?.status || 500).json({
      error: discordMsg || 'Failed to update avatar',
    });
  }
}));
