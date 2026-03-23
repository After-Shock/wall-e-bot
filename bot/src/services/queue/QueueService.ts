import { Queue, Worker, type Job } from 'bullmq';
import { logger } from '../../utils/logger.js';

const SCHEDULER_QUEUE = 'scheduler';
const TICK_JOB = 'scheduler-tick';
const TICK_INTERVAL_MS = 60_000;

interface QueueClient {
  scheduler: { runSchedulerTick(): Promise<void> };
  db: { pool: { query(sql: string, params?: unknown[]): Promise<unknown> } };
}

export class QueueService {
  private queue: Queue;
  private worker: Worker | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly client: QueueClient,
  ) {
    const connection = { url: redisUrl };
    this.queue = new Queue(SCHEDULER_QUEUE, { connection });
  }

  async start(): Promise<void> {
    await this.queue.upsertJobScheduler(
      TICK_JOB,
      { every: TICK_INTERVAL_MS },
      { name: TICK_JOB, data: {} },
    );

    this.worker = new Worker(
      SCHEDULER_QUEUE,
      async (job: Job) => {
        if (job.name === TICK_JOB) {
          try {
            await this.client.scheduler.runSchedulerTick();
          } catch (err) {
            logger.error('[Queue] Scheduler tick failed:', err);
            throw err; // Re-throw so BullMQ marks the job as failed and triggers onFailed handler
          }
        }
      },
      {
        connection: { url: this.redisUrl },
        concurrency: 1,
      },
    );

    this.worker.on('failed', async (job, err) => {
      logger.error(`[Queue] Job ${job?.name} failed (attempt ${job?.attemptsMade}):`, err);
      try {
        await this.client.db.pool.query(
          `INSERT INTO failed_jobs (queue_name, job_name, job_data, error_message, attempt_count)
           VALUES ($1, $2, $3, $4, $5)`,
          [SCHEDULER_QUEUE, job?.name ?? 'unknown', job?.data ?? {}, err.message, job?.attemptsMade ?? 1],
        );
      } catch (dbErr) {
        logger.error('[Queue] Failed to record failed job:', dbErr);
      }
    });

    this.worker.on('error', (err) => {
      logger.error('[Queue] Worker error:', err);
    });

    logger.info('[Queue] Scheduler queue started — repeatable tick every 60s');
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close(); // BullMQ close() drains in-flight jobs by default
    }
    await this.queue.close();
    logger.info('[Queue] Scheduler queue stopped');
  }
}
