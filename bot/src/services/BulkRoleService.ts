import { EmbedBuilder, type Guild, type GuildMember } from 'discord.js';
import { COLORS } from '@wall-e/shared';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';
import { matchesBulkRoleFilter, needsChange, type BulkRoleJob } from '../utils/bulkRoleFilter.js';

/** How often (in members) progress is saved and a cancel request is checked. */
const PROGRESS_EVERY = 10;

/**
 * Runs bulk role jobs queued by the dashboard. One Discord call per member, so
 * jobs run in the background; discord.js queues requests under Discord's rate
 * limits. A job interrupted by a restart stays 'running' and is resumed: members
 * already changed are skipped, so re-running is safe.
 */
export class BulkRoleService {
  private readonly running = new Set<number>();

  constructor(private readonly client: WallEClient) {}

  /** Start every queued or interrupted job this process isn't already running. Does not wait for them. */
  async startPending(): Promise<void> {
    const { rows } = await this.client.db.pool.query(
      "SELECT id FROM bulk_role_jobs WHERE status IN ('queued', 'running', 'cancelling') ORDER BY id",
    );
    for (const { id } of rows as { id: number }[]) this.start(id);
  }

  start(jobId: number): void {
    if (this.running.has(jobId)) return;
    this.running.add(jobId);
    this.run(jobId)
      .catch(error => logger.error(`Bulk role job ${jobId} crashed:`, error))
      .finally(() => this.running.delete(jobId));
  }

  private async run(jobId: number): Promise<void> {
    const job = await this.load(jobId);
    if (!job || !['queued', 'running', 'cancelling'].includes(job.status)) return;

    const guild = this.client.guilds.cache.get(job.guild_id);
    if (!guild) {
      await this.finish(job, 'failed', 'Wall-E is not in this server');
      return;
    }
    if (job.status === 'cancelling') {
      await this.finish(job, 'cancelled');
      return;
    }

    const role = guild.roles.cache.get(job.role_id);
    if (!role) return this.finish(job, 'failed', 'The role no longer exists');
    if (!role.editable) {
      return this.finish(job, 'failed', `@${role.name} is above Wall-E's highest role, or Wall-E lacks Manage Roles`);
    }

    try {
      const members = await guild.members.fetch();
      const targets = [...members.values()].filter(member => {
        const view = { bot: member.user.bot, roleIds: [...member.roles.cache.keys()], joinedAt: member.joinedAt };
        return matchesBulkRoleFilter(view, job) && needsChange(view, job);
      });

      await this.client.db.pool.query(
        "UPDATE bulk_role_jobs SET status = 'running', total = $2, processed = 0 WHERE id = $1 AND status IN ('queued', 'running')",
        [job.id, targets.length],
      );

      let { changed, failed } = job;
      for (const [index, member] of targets.entries()) {
        if (index % PROGRESS_EVERY === 0 && index > 0) {
          const status = await this.saveProgress(job.id, index, changed, failed);
          if (status === 'cancelling') return this.finish({ ...job, changed, failed }, 'cancelled', null, guild);
        }
        try {
          await this.apply(member, job);
          changed++;
        } catch (error) {
          failed++;
          logger.warn(`Bulk role job ${job.id}: could not update ${member.id}: ${(error as Error).message}`);
        }
      }
      await this.saveProgress(job.id, targets.length, changed, failed);
      await this.finish({ ...job, changed, failed }, 'done', null, guild);
    } catch (error) {
      logger.error(`Bulk role job ${job.id} failed:`, error);
      await this.finish(job, 'failed', (error as Error).message, guild);
    }
  }

  private apply(member: GuildMember, job: BulkRoleJob) {
    const reason = `Bulk role job #${job.id}`;
    return job.operation === 'add'
      ? member.roles.add(job.role_id, reason)
      : member.roles.remove(job.role_id, reason);
  }

  private async load(jobId: number): Promise<BulkRoleJob | null> {
    const { rows } = await this.client.db.pool.query('SELECT * FROM bulk_role_jobs WHERE id = $1', [jobId]);
    return (rows[0] as BulkRoleJob | undefined) ?? null;
  }

  /** Saves progress and returns the job's current status (to notice cancel requests). */
  private async saveProgress(jobId: number, processed: number, changed: number, failed: number): Promise<string> {
    const { rows } = await this.client.db.pool.query(
      'UPDATE bulk_role_jobs SET processed = $2, changed = $3, failed = $4 WHERE id = $1 RETURNING status',
      [jobId, processed, changed, failed],
    );
    return rows[0]?.status ?? 'cancelling';
  }

  private async finish(job: BulkRoleJob, status: 'done' | 'cancelled' | 'failed', error: string | null = null, guild?: Guild) {
    await this.client.db.pool.query(
      'UPDATE bulk_role_jobs SET status = $2, error = $3, finished_at = NOW() WHERE id = $1',
      [job.id, status, error],
    );
    if (guild && job.notify_channel_id) await this.notify(guild, job, status, error);
  }

  private async notify(guild: Guild, job: BulkRoleJob, status: string, error: string | null) {
    const channel = guild.channels.cache.get(job.notify_channel_id!);
    if (!channel?.isTextBased()) return;
    const verb = job.operation === 'add' ? 'added to' : 'removed from';
    const title = status === 'done' ? 'Bulk role finished' : status === 'cancelled' ? 'Bulk role cancelled' : 'Bulk role failed';
    const embed = new EmbedBuilder()
      .setColor(status === 'done' ? COLORS.SUCCESS : status === 'cancelled' ? COLORS.WARNING : COLORS.ERROR)
      .setTitle(title)
      .setDescription(`<@&${job.role_id}> ${verb} **${job.changed}** member${job.changed === 1 ? '' : 's'}` +
        (job.failed ? `, **${job.failed}** failed` : '') + (error ? `\n${error}` : ''))
      .setFooter({ text: `Job #${job.id}` })
      .setTimestamp();
    // Never ping the role or anyone else from a summary.
    await channel.send({ content: `Started by <@${job.started_by}>`, embeds: [embed], allowedMentions: { parse: [] } })
      .catch(err => logger.warn(`Bulk role job ${job.id}: could not post notification: ${(err as Error).message}`));
  }
}
