import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const autoDeleteRouter = Router({ mergeParams: true });

autoDeleteRouter.use(requireAuth, requireGuildAccess);

const AutoDeleteBaseSchema = z.object({
  channel_id: z.string().min(1).max(20),
  max_age_hours: z.number().int().min(1).max(8760).nullable().optional(), // max 1 year
  max_messages: z.number().int().min(1).max(10000).nullable().optional(),
  exempt_roles: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

const AutoDeleteSchema = AutoDeleteBaseSchema.refine(d => d.max_age_hours != null || d.max_messages != null, {
  message: 'At least one of max_age_hours or max_messages must be set',
});

const AutoDeletePatchSchema = AutoDeleteBaseSchema.partial();

// GET /api/guilds/:guildId/auto-delete
autoDeleteRouter.get('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const result = await db.query(
    'SELECT * FROM auto_delete_channels WHERE guild_id = $1 ORDER BY created_at',
    [guildId],
  );
  res.json(result.rows);
}));

// POST /api/guilds/:guildId/auto-delete
autoDeleteRouter.post('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const parsed = AutoDeleteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
  const d = parsed.data;
  const result = await db.query(
    `INSERT INTO auto_delete_channels (guild_id, channel_id, max_age_hours, max_messages, exempt_roles, enabled)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (guild_id, channel_id) DO UPDATE SET
       max_age_hours = $3, max_messages = $4, exempt_roles = $5, enabled = $6
     RETURNING *`,
    [guildId, d.channel_id, d.max_age_hours ?? null, d.max_messages ?? null, d.exempt_roles, d.enabled],
  );
  res.status(201).json(result.rows[0]);
}));

// PATCH /api/guilds/:guildId/auto-delete/:id
autoDeleteRouter.patch('/:id', asyncHandler(async (req, res) => {
  const { guildId, id } = req.params;
  const parsed = AutoDeletePatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
  const d = parsed.data;
  const fields = Object.keys(d) as (keyof typeof d)[];
  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
  const setClauses = fields.map((f, i) => `${String(f)} = $${i + 3}`).join(', ');
  const values = fields.map(f => d[f]);
  const result = await db.query(
    `UPDATE auto_delete_channels SET ${setClauses} WHERE id = $1 AND guild_id = $2 RETURNING *`,
    [id, guildId, ...values],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(result.rows[0]);
}));

// DELETE /api/guilds/:guildId/auto-delete/:id
autoDeleteRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { guildId, id } = req.params;
  const result = await db.query(
    'DELETE FROM auto_delete_channels WHERE id = $1 AND guild_id = $2 RETURNING id',
    [id, guildId],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ success: true });
}));
