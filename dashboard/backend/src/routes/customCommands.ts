import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';

export const customCommandsRouter = Router({ mergeParams: true });

customCommandsRouter.use(requireAuth, requireGuildAccess);

const CommandSchema = z.object({
  name: z.string().min(1).max(100).toLowerCase(),
  response: z.string().min(1).max(2500),
  embed_response: z.boolean().default(false),
  embed_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  cooldown: z.number().int().min(0).max(3600).default(0),
  delete_command: z.boolean().default(false),
  case_sensitive: z.boolean().default(false),
  trigger_on_edit: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

// GET /api/guilds/:guildId/custom-commands
customCommandsRouter.get('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const result = await db.query(
    `SELECT id, name, response, embed_response, embed_color, cooldown,
            delete_command, case_sensitive, trigger_on_edit, enabled, uses, created_at
     FROM custom_commands WHERE guild_id = $1 ORDER BY name`,
    [guildId],
  );
  res.json(result.rows);
}));

// POST /api/guilds/:guildId/custom-commands
customCommandsRouter.post('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const parsed = CommandSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    return;
  }
  const d = parsed.data;

  const existing = await db.query(
    'SELECT id FROM custom_commands WHERE guild_id = $1 AND name = $2',
    [guildId, d.name],
  );
  if (existing.rows.length > 0) {
    res.status(409).json({ error: `Command "${d.name}" already exists` });
    return;
  }

  const result = await db.query(
    `INSERT INTO custom_commands
       (guild_id, name, response, embed_response, embed_color, cooldown,
        delete_command, case_sensitive, trigger_on_edit, enabled, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [guildId, d.name, d.response, d.embed_response, d.embed_color ?? null,
     d.cooldown, d.delete_command, d.case_sensitive, d.trigger_on_edit,
     d.enabled, (req as any).user?.discord_id ?? 'dashboard'],
  );
  logger.info(`Custom command created: ${d.name} in ${guildId}`);
  res.status(201).json(result.rows[0]);
}));

// PATCH /api/guilds/:guildId/custom-commands/:commandId
customCommandsRouter.patch('/:commandId', asyncHandler(async (req, res) => {
  const { guildId, commandId } = req.params;
  const parsed = CommandSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    return;
  }
  const d = parsed.data;
  const fields = Object.keys(d) as (keyof typeof d)[];
  if (fields.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  const setClauses = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const values = fields.map(f => d[f]);

  const result = await db.query(
    `UPDATE custom_commands SET ${setClauses}, updated_at = NOW()
     WHERE id = $1 AND guild_id = $2 RETURNING *`,
    [commandId, guildId, ...values],
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Command not found' });
    return;
  }
  res.json(result.rows[0]);
}));

// DELETE /api/guilds/:guildId/custom-commands/:commandId
customCommandsRouter.delete('/:commandId', asyncHandler(async (req, res) => {
  const { guildId, commandId } = req.params;
  const result = await db.query(
    'DELETE FROM custom_commands WHERE id = $1 AND guild_id = $2 RETURNING name',
    [commandId, guildId],
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Command not found' });
    return;
  }
  logger.info(`Custom command deleted: ${result.rows[0].name} in ${guildId}`);
  res.json({ success: true });
}));
