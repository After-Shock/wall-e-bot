import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimitByGuild } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { channelError } from '../utils/discordChannels.js';
import { unassignableRoleError } from '../utils/discordRoles.js';
import { redis } from '../redis.js';

// Bulk role: add or remove one role for every member matching a filter. The bot
// does the work (it has the member list); this router queues, lists and cancels jobs.
export const bulkRoleRouter = Router({ mergeParams: true });

bulkRoleRouter.use(requireAuth, requireGuildAccess);

const snowflake = z.string().regex(/^\d{17,20}$/, 'Invalid Discord ID');

const JobSchema = z.object({
  role_id: snowflake,
  operation: z.enum(['add', 'remove']),
  filter_type: z.enum(['all', 'humans', 'bots', 'has_roles', 'missing_roles', 'joined_after', 'joined_before']),
  filter_role_ids: z.array(snowflake).max(25).default([]),
  require_all: z.boolean().default(false),
  joined_at: z.string().datetime({ offset: true }).nullable().optional(),
  notify_channel_id: snowflake.nullable().optional(),
}).superRefine((job, ctx) => {
  const roleFilter = job.filter_type === 'has_roles' || job.filter_type === 'missing_roles';
  if (roleFilter && job.filter_role_ids.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'Choose at least one role to filter by' });
  }
  if (job.filter_type.startsWith('joined_') && !job.joined_at) {
    ctx.addIssue({ code: 'custom', message: 'Choose a join date' });
  }
});

// GET /api/guilds/:guildId/bulk-role — recent jobs, newest first
bulkRoleRouter.get('/', asyncHandler(async (req, res) => {
  const result = await db.query(
    'SELECT * FROM bulk_role_jobs WHERE guild_id = $1 ORDER BY id DESC LIMIT 10',
    [req.params.guildId],
  );
  res.json(result.rows);
}));

// POST /api/guilds/:guildId/bulk-role — queue a job
bulkRoleRouter.post('/', rateLimitByGuild({ max: 5, windowSeconds: 60 }), asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const parsed = JobSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }
  const job = parsed.data;

  if (job.role_id === guildId) { res.status(400).json({ error: '@everyone cannot be added or removed' }); return; }
  const roleError = await unassignableRoleError(guildId, [job.role_id]);
  if (roleError) { res.status(400).json({ error: roleError }); return; }
  if (job.notify_channel_id) {
    const channelErr = await channelError(job.notify_channel_id, guildId);
    if (channelErr) { res.status(400).json({ error: `Notification channel: ${channelErr}` }); return; }
  }

  const roleFilter = job.filter_type === 'has_roles' || job.filter_type === 'missing_roles';
  let row;
  try {
    const result = await db.query(
      `INSERT INTO bulk_role_jobs
         (guild_id, role_id, operation, filter_type, filter_role_ids, require_all, joined_at, notify_channel_id, started_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [guildId, job.role_id, job.operation, job.filter_type, roleFilter ? job.filter_role_ids : [],
        roleFilter && job.require_all, job.filter_type.startsWith('joined_') ? job.joined_at : null,
        job.notify_channel_id ?? null, (req as AuthenticatedRequest).user!.id],
    );
    row = result.rows[0];
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'A bulk role job is already running for this server. Wait for it or cancel it first.' });
      return;
    }
    throw error;
  }

  // The bot also picks up queued jobs on its scheduler tick, so a lost publish only delays the start.
  await redis.publish('bulk-role:trigger', JSON.stringify({ jobId: row.id })).catch(() => {});
  res.status(201).json(row);
}));

// POST /api/guilds/:guildId/bulk-role/:id/cancel
bulkRoleRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  const result = await db.query(
    `UPDATE bulk_role_jobs
     SET status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE 'cancelling' END,
         finished_at = CASE WHEN status = 'queued' THEN NOW() ELSE finished_at END
     WHERE id = $1 AND guild_id = $2 AND status IN ('queued', 'running')
     RETURNING *`,
    [req.params.id, req.params.guildId],
  );
  if (!result.rows[0]) { res.status(404).json({ error: 'No active job to cancel' }); return; }
  res.json(result.rows[0]);
}));
