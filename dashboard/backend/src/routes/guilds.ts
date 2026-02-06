import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess, AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

export const guildsRouter = Router();

// Get user's guilds
guildsRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Fetch user's guilds from Discord API
    const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: {
        Authorization: `Bearer ${req.user!.accessToken}`,
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch guilds' });
    }

    const guilds = await response.json();
    
    // Filter to guilds where user has MANAGE_GUILD or is owner
    const manageableGuilds = guilds.filter((guild: any) => {
      const permissions = BigInt(guild.permissions);
      const MANAGE_GUILD = BigInt(0x20);
      const ADMINISTRATOR = BigInt(0x8);
      return guild.owner || (permissions & MANAGE_GUILD) === MANAGE_GUILD || (permissions & ADMINISTRATOR) === ADMINISTRATOR;
    });

    // Store guilds in session for permission checking
    (req.user as any).guilds = guilds;

    // Get bot's guilds to check where bot is present
    const botGuildsResult = await db.query('SELECT guild_id FROM guild_configs');
    const botGuildIds = new Set(botGuildsResult.rows.map(r => r.guild_id));

    const guildsWithBotStatus = manageableGuilds.map((guild: any) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      owner: guild.owner,
      botPresent: botGuildIds.has(guild.id),
    }));

    res.json(guildsWithBotStatus);
  } catch (error) {
    logger.error('Error fetching guilds:', error);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

// Get guild config
guildsRouter.get('/:guildId', requireAuth, requireGuildAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { guildId } = req.params;
    
    const result = await db.query(
      'SELECT * FROM guild_configs WHERE guild_id = $1',
      [guildId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching guild config:', error);
    res.status(500).json({ error: 'Failed to fetch guild config' });
  }
});

// Update guild config
guildsRouter.patch('/:guildId', requireAuth, requireGuildAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { guildId } = req.params;
    const updates = req.body;

    await db.query(
      `INSERT INTO guild_configs (guild_id, config)
       VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE SET config = $2, updated_at = NOW()`,
      [guildId, JSON.stringify(updates)]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating guild config:', error);
    res.status(500).json({ error: 'Failed to update guild config' });
  }
});

// Get guild leaderboard
guildsRouter.get('/:guildId/leaderboard', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { guildId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    const result = await db.query(
      `SELECT user_id, xp, level, total_xp, message_count
       FROM guild_members
       WHERE guild_id = $1
       ORDER BY total_xp DESC
       LIMIT $2 OFFSET $3`,
      [guildId, limit, offset]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM guild_members WHERE guild_id = $1',
      [guildId]
    );

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    });
  } catch (error) {
    logger.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get guild warnings
guildsRouter.get('/:guildId/warnings', requireAuth, requireGuildAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { guildId } = req.params;
    const userId = req.query.userId as string;

    let query = 'SELECT * FROM warnings WHERE guild_id = $1';
    const params: any[] = [guildId];

    if (userId) {
      query += ' AND user_id = $2';
      params.push(userId);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching warnings:', error);
    res.status(500).json({ error: 'Failed to fetch warnings' });
  }
});
