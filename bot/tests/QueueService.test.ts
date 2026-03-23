import { describe, it, jest, expect } from '@jest/globals';

// Mock bullmq
const mockUpsertJobScheduler = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockQueueClose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockWorkerOn = jest.fn<() => void>();
const mockWorkerClose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    upsertJobScheduler: mockUpsertJobScheduler,
    close: mockQueueClose,
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: mockWorkerOn,
    close: mockWorkerClose,
  })),
}));

describe('QueueService', () => {
  it('registers a scheduler job on start', async () => {
    const { QueueService } = await import('../src/services/queue/QueueService.js');
    const fakeClient = {
      scheduler: { runSchedulerTick: async () => { /* noop */ } },
      db: { pool: { query: async () => ({ rows: [] }) } },
    };
    const qs = new QueueService('redis://localhost:6379', fakeClient);
    await qs.start();
    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      'scheduler-tick',
      expect.objectContaining({ every: 60000 }),
      expect.anything(),
    );
    await qs.stop();
  });

  it('passes a processor function to Worker and it invokes runSchedulerTick', async () => {
    const { Worker } = await import('bullmq');
    const { QueueService } = await import('../src/services/queue/QueueService.js');

    const runSchedulerTick = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const fakeClient = {
      scheduler: { runSchedulerTick },
      db: { pool: { query: jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] }) } },
    };

    const qs = new QueueService('redis://localhost:6379', fakeClient);
    await qs.start();

    // Retrieve the processor function that was passed as 2nd arg to Worker constructor
    const workerCalls = (Worker as unknown as jest.Mock).mock.calls;
    const lastCall = workerCalls[workerCalls.length - 1];
    const processor = lastCall[1] as (job: unknown) => Promise<void>;

    expect(typeof processor).toBe('function');

    // Invoke the processor with a scheduler-tick job
    await processor({ name: 'scheduler-tick', data: {} });
    expect(runSchedulerTick).toHaveBeenCalledTimes(1);

    await qs.stop();
  });
});
