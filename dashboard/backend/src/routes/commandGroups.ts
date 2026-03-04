import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const commandGroupsRouter = Router({ mergeParams: true });

commandGroupsRouter.use(requireAuth, requireGuildAccess);

const GroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  allowed_roles: z.array(z.string()).default([]),
  allowed_channels: z.array(z.string()).default([]),
  ignore_roles: z.array(z.string()).default([]),
  ignore_channels: z.array(z.string()).default([]),
  position: z.number().int().min(0).default(0),
});

// GET /api/guilds/:guildId/command-groups
commandGroupsRouter.get('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const result = await db.query(
    'SELECT * FROM command_groups WHERE guild_id = $1 ORDER BY position, name',
    [guildId],
  );
  res.json(result.rows);
}));

// POST /api/guilds/:guildId/command-groups
commandGroupsRouter.post('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const parsed = GroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    return;
  }
  const d = parsed.data;

  const result = await db.query(
    `INSERT INTO command_groups
       (guild_id, name, description, allowed_roles, allowed_channels,
        ignore_roles, ignore_channels, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [guildId, d.name, d.description ?? null, d.allowed_roles, d.allowed_channels,
     d.ignore_roles, d.ignore_channels, d.position],
  );
  res.status(201).json(result.rows[0]);
}));

// PATCH /api/guilds/:guildId/command-groups/:groupId
commandGroupsRouter.patch('/:groupId', asyncHandler(async (req, res) => {
  const { guildId, groupId } = req.params;
  const parsed = GroupSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    return;
  }
  const d = parsed.data;
  const fields = Object.keys(d) as (keyof typeof d)[];
  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  const setClauses = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const values = fields.map(f => d[f]);

  const result = await db.query(
    `UPDATE command_groups SET ${setClauses} WHERE id = $1 AND guild_id = $2 RETURNING *`,
    [groupId, guildId, ...values],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Group not found' }); return; }
  res.json(result.rows[0]);
}));

// DELETE /api/guilds/:guildId/command-groups/:groupId
commandGroupsRouter.delete('/:groupId', asyncHandler(async (req, res) => {
  const { guildId, groupId } = req.params;
  // Commands are set to group_id = NULL by the FK ON DELETE SET NULL
  const result = await db.query(
    'DELETE FROM command_groups WHERE id = $1 AND guild_id = $2 RETURNING name',
    [groupId, guildId],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Group not found' }); return; }
  res.json({ success: true });
}));
