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
});
