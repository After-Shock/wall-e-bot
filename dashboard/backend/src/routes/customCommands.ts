import { Router } from 'express';
import { z } from 'zod';
import Handlebars from 'handlebars';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';

export const customCommandsRouter = Router({ mergeParams: true });

customCommandsRouter.use(requireAuth, requireGuildAccess);

const TriggerTypeEnum = z.enum([
  'command', 'starts_with', 'contains', 'exact_match', 'regex', 'reaction', 'interval',
]);

const CommandSchema = z.object({
  name: z.string().min(1).max(100),
  trigger_type: TriggerTypeEnum.default('command'),
  group_id: z.number().int().nullable().optional(),
  responses: z.array(z.string().min(1).max(20000)).min(1).max(20),
  embed_response: z.boolean().default(false),
  embed_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  cooldown: z.number().int().min(0).max(3600).default(0),
  delete_command: z.boolean().default(false),
  case_sensitive: z.boolean().default(false),
  trigger_on_edit: z.boolean().default(false),
  enabled: z.boolean().default(true),
  allowed_roles: z.array(z.string()).default([]),
  allowed_channels: z.array(z.string()).default([]),
  interval_cron: z.string().max(100).nullable().optional(),
  interval_channel_id: z.string().max(20).nullable().optional(),
  reaction_message_id: z.string().max(20).nullable().optional(),
  reaction_channel_id: z.string().max(20).nullable().optional(),
  reaction_emoji: z.string().max(100).nullable().optional(),
  reaction_type: z.enum(['add', 'remove', 'both']).nullable().optional(),
});

function validateCommand(data: z.infer<typeof CommandSchema>): string | null {
  // Validate regex
  if (data.trigger_type === 'regex') {
    try { new RegExp(data.name); } catch (e: unknown) {
      return `Invalid regex pattern: ${(e as Error).message}`;
    }
  }
  // Validate Handlebars templates
  for (const response of data.responses) {
    try { Handlebars.precompile(response); } catch (e: unknown) {
      return `Invalid template syntax: ${(e as Error).message}`;
    }
  }
  // Interval requires cron + channel
  if (data.trigger_type === 'interval') {
    if (!data.interval_cron) return 'interval_cron is required for interval commands';
    if (!data.interval_channel_id) return 'interval_channel_id is required for interval commands';
  }
  return null;
}

const SELECT_COLS = `
  id, guild_id, name, trigger_type, group_id, responses,
  embed_response, embed_color, cooldown, delete_command,
  case_sensitive, trigger_on_edit, enabled, allowed_roles, allowed_channels,
  interval_cron, interval_channel_id, interval_next_run,
  reaction_message_id, reaction_channel_id, reaction_emoji, reaction_type,
  uses, created_by, created_at, updated_at
`;

// GET /api/guilds/:guildId/custom-commands
customCommandsRouter.get('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const result = await db.query(
    `SELECT ${SELECT_COLS} FROM custom_commands WHERE guild_id = $1 ORDER BY trigger_type, name`,
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
  const validErr = validateCommand(d);
  if (validErr) { res.status(400).json({ error: validErr }); return; }

  // For command type, check uniqueness
  if (d.trigger_type === 'command') {
    const existing = await db.query(
      'SELECT id FROM custom_commands WHERE guild_id = $1 AND name = $2 AND trigger_type = $3',
      [guildId, d.name, 'command'],
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: `Command "${d.name}" already exists` });
      return;
    }
  }

  const result = await db.query(
    `INSERT INTO custom_commands
       (guild_id, name, trigger_type, group_id, responses, response,
        embed_response, embed_color, cooldown, delete_command,
        case_sensitive, trigger_on_edit, enabled, allowed_roles, allowed_channels,
        interval_cron, interval_channel_id,
        reaction_message_id, reaction_channel_id, reaction_emoji, reaction_type,
        created_by)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     RETURNING ${SELECT_COLS}`,
    [
      guildId, d.name, d.trigger_type, d.group_id ?? null,
      JSON.stringify(d.responses), d.responses[0], // keep response col in sync
      d.embed_response, d.embed_color ?? null, d.cooldown, d.delete_command,
      d.case_sensitive, d.trigger_on_edit, d.enabled,
      d.allowed_roles, d.allowed_channels,
      d.interval_cron ?? null, d.interval_channel_id ?? null,
      d.reaction_message_id ?? null, d.reaction_channel_id ?? null,
      d.reaction_emoji ?? null, d.reaction_type ?? null,
      (req as { user?: { discord_id?: string } }).user?.discord_id ?? 'dashboard',
    ],
  );
  logger.info(`Custom command created: ${d.name} (${d.trigger_type}) in ${guildId}`);
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

  // Validate if relevant fields present
  if (d.trigger_type || d.name || d.responses) {
    // Fetch current row to merge
    const current = await db.query(
      'SELECT trigger_type, name, responses FROM custom_commands WHERE id = $1 AND guild_id = $2',
      [commandId, guildId],
    );
    if (current.rows.length === 0) { res.status(404).json({ error: 'Command not found' }); return; }
    const merged = { ...current.rows[0], ...d } as z.infer<typeof CommandSchema>;
    const validErr = validateCommand(merged);
    if (validErr) { res.status(400).json({ error: validErr }); return; }
  }

  const fieldMap: Record<string, unknown> = { ...d };
  // Keep response col in sync if responses changed
  if (d.responses) fieldMap['response'] = d.responses[0];

  const fields = Object.keys(fieldMap);
  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  const setClauses = fields.map((f, i) => {
    if (f === 'responses') return `responses = $${i + 3}::jsonb`;
    return `${f} = $${i + 3}`;
  }).join(', ');
  const values = fields.map(f => f === 'responses' ? JSON.stringify(fieldMap[f]) : fieldMap[f]);

  const result = await db.query(
    `UPDATE custom_commands SET ${setClauses}, updated_at = NOW()
     WHERE id = $1 AND guild_id = $2 RETURNING ${SELECT_COLS}`,
    [commandId, guildId, ...values],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Command not found' }); return; }
  res.json(result.rows[0]);
}));

// DELETE /api/guilds/:guildId/custom-commands/:commandId
customCommandsRouter.delete('/:commandId', asyncHandler(async (req, res) => {
  const { guildId, commandId } = req.params;
  const result = await db.query(
    'DELETE FROM custom_commands WHERE id = $1 AND guild_id = $2 RETURNING name',
    [commandId, guildId],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Command not found' }); return; }
  logger.info(`Custom command deleted: ${result.rows[0].name} in ${guildId}`);
  res.json({ success: true });
}));
