/**
 * SchedulerService Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { logger } from '../../src/utils/logger.js';

// Mock timers
jest.useFakeTimers();

// Create mock client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChannelSend = jest.fn<any>();
const mockGuild = {
  id: 'guild-123',
  name: 'Test Server',
  memberCount: 100,
  channels: {
    cache: new Map([
      ['channel-1', {
        id: 'channel-1',
        // Real discord.js channels expose isTextBased(); the scheduler checks it
        // so a task pointed at a voice or category channel fails cleanly.
        isTextBased: () => true,
        send: mockChannelSend.mockResolvedValue({ id: 'msg-1' }),
      }],
    ]),
  },
};

const mockRedisClient = {
  duplicate: () => ({
    on: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    disconnect: jest.fn(),
  }),
};

const mockClient = {
  db: {
    pool: {
      query: mockQuery,
    },
  },
  guilds: {
    cache: new Map([['guild-123', mockGuild]]),
  },
  cache: {
    redisClient: mockRedisClient,
  },
  template: {
    render: jest.fn<any>((raw: string) => raw),
  },
};

// Import SchedulerService
const { SchedulerService } = await import('../../src/services/SchedulerService.js');

/** A task claim that succeeded — the scheduler only sends when it wins the CAS. */
const CLAIM_WON = { rows: [{ id: 1 }], rowCount: 1 };

/**
 * Find the query the scheduler issued that matches `fragment`.
 *
 * Tests used to index into mock.calls positionally, which broke as soon as the
 * number of queries changed — and start() interleaves several independent
 * checks, so position is not even stable between runs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const queryMatching = (fragment: string): any[] | undefined =>
  mockQuery.mock.calls.find((c: unknown[]) => String(c[0]).includes(fragment));

describe('SchedulerService', () => {
  let scheduler: InstanceType<typeof SchedulerService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    
    // @ts-expect-error - Using mock client
    scheduler = new SchedulerService(mockClient);
  });

  afterEach(async () => {
    await scheduler.stop();
    jest.clearAllTimers();
  });

  describe('local scheduler lifecycle', () => {
    const deferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => { resolve = done; });
      return { promise, resolve };
    };

    it('awaits the immediate scheduler tick before startup completes', async () => {
      const tick = deferred();
      const runTick = jest.spyOn(scheduler, 'runSchedulerTick').mockReturnValue(tick.promise);
      let started = false;

      const startPromise = scheduler.start().then(() => { started = true; });
      await Promise.resolve();

      expect(runTick).toHaveBeenCalledTimes(1);
      expect(started).toBe(false);

      tick.resolve();
      await startPromise;
      expect(started).toBe(true);
    });

    it('schedules the next tick only after the current tick finishes', async () => {
      const inFlight = deferred();
      const runTick = jest.spyOn(scheduler, 'runSchedulerTick')
        .mockResolvedValueOnce(undefined)
        .mockReturnValueOnce(inFlight.promise)
        .mockResolvedValue(undefined);

      await scheduler.start();
      expect(runTick).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(60_000);
      expect(runTick).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(180_000);
      expect(runTick).toHaveBeenCalledTimes(2);

      inFlight.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(59_999);
      expect(runTick).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(1);
      expect(runTick).toHaveBeenCalledTimes(3);
    });

    it('processes PostgreSQL work that remained due while the process was down', async () => {
      const dueTask = {
        id: 17,
        guild_id: 'guild-123',
        channel_id: 'channel-1',
        message: 'Persisted while offline',
        embed: false,
        next_run: new Date('2026-01-01T00:00:00Z'),
        enabled: true,
        failure_count: 0,
      };
      const dueRows = deferred();
      let servedDueRows = false;
      mockQuery.mockImplementation(async (sql: unknown) => {
        if (typeof sql === 'string' && sql.includes('FROM scheduled_messages')) {
          await dueRows.promise;
          if (!servedDueRows) {
            servedDueRows = true;
            return { rows: [dueTask], rowCount: 1 };
          }
        }
        if (typeof sql === 'string' && sql.includes('UPDATE scheduled_messages SET enabled = false')) {
          return CLAIM_WON;
        }
        return { rows: [], rowCount: 0 };
      });

      // No in-memory queue state is carried into this new service instance.
      // The due row remains in PostgreSQL and the immediate startup tick finds it.
      // @ts-expect-error - Using mock client
      scheduler = new SchedulerService(mockClient);
      let started = false;
      const startPromise = scheduler.start().then(() => { started = true; });
      await Promise.resolve();
      expect(started).toBe(false);

      dueRows.resolve();
      await startPromise;
      expect(mockChannelSend).toHaveBeenCalledWith('Persisted while offline');
    });

    it('awaits an in-flight tick during shutdown and starts no later tick', async () => {
      const inFlight = deferred();
      const runTick = jest.spyOn(scheduler, 'runSchedulerTick')
        .mockResolvedValueOnce(undefined)
        .mockReturnValueOnce(inFlight.promise);

      await scheduler.start();
      await jest.advanceTimersByTimeAsync(60_000);
      let stopped = false;
      const stopPromise = scheduler.stop().then(() => { stopped = true; });
      await Promise.resolve();
      expect(stopped).toBe(false);

      inFlight.resolve();
      await stopPromise;
      expect(stopped).toBe(true);

      await jest.advanceTimersByTimeAsync(180_000);
      expect(runTick).toHaveBeenCalledTimes(2);
    });
  });

  describe('runSchedulerTick', () => {
    it('should query for due tasks when ticked', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await scheduler.runSchedulerTick();

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('task execution', () => {
    it('should execute due tasks', async () => {
      const mockTask = {
        id: 1,
        guild_id: 'guild-123',
        channel_id: 'channel-1',
        message: 'Hello {server}!',
        embed: false,
        interval_minutes: 60,
        next_run: new Date(),
        enabled: true,
      };
      
      mockQuery
        .mockResolvedValueOnce({ rows: [mockTask] }) // SELECT due tasks
        .mockResolvedValueOnce(CLAIM_WON); // CAS claim on next_run

      await scheduler.runSchedulerTick();

      expect(mockChannelSend).toHaveBeenCalledWith('Hello Test Server!');
    });

    it('should skip tasks for missing guilds', async () => {
      const mockTask = {
        id: 1,
        guild_id: 'nonexistent-guild',
        channel_id: 'channel-1',
        message: 'Test',
        embed: false,
        next_run: new Date(),
        enabled: true,
      };
      
      mockQuery
        .mockResolvedValueOnce({ rows: [mockTask] })
        .mockResolvedValueOnce(CLAIM_WON);

      await scheduler.runSchedulerTick();

      expect(mockChannelSend).not.toHaveBeenCalled();
    });

    it('should skip tasks for missing channels', async () => {
      const mockTask = {
        id: 1,
        guild_id: 'guild-123',
        channel_id: 'nonexistent-channel',
        message: 'Test',
        embed: false,
        next_run: new Date(),
        enabled: true,
      };
      
      mockQuery
        .mockResolvedValueOnce({ rows: [mockTask] })
        .mockResolvedValueOnce(CLAIM_WON);

      await scheduler.runSchedulerTick();

      expect(mockChannelSend).not.toHaveBeenCalled();
    });
  });

  describe('claim protocol', () => {
    const dueTask = (over: Record<string, unknown> = {}) => ({
      id: 1,
      guild_id: 'guild-123',
      channel_id: 'channel-1',
      message: 'Hi',
      embed: false,
      interval_minutes: 60,
      next_run: new Date('2026-01-01T00:00:00Z'),
      enabled: true,
      failure_count: 0,
      ...over,
    });

    it('does not send when another process already claimed the task', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [dueTask()] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // lost the CAS

      await scheduler.runSchedulerTick();

      expect(mockChannelSend).not.toHaveBeenCalled();
    });

    it('advances next_run before sending, so a crash cannot re-send', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [dueTask()] })
        .mockResolvedValueOnce(CLAIM_WON);

      await scheduler.runSchedulerTick();

      const claim = queryMatching('UPDATE scheduled_messages SET next_run');
      expect(claim).toBeDefined();
      expect(String(claim![0])).toContain('AND next_run = $3');
      // The claim is issued before the message goes out, so a crash between the
      // two loses the send rather than repeating it.
      const claimOrder = mockQuery.mock.invocationCallOrder[
        mockQuery.mock.calls.indexOf(claim!)
      ];
      expect(claimOrder).toBeLessThan(mockChannelSend.mock.invocationCallOrder[0]);
    });

    it('counts a failure and eventually disables a task with a dead channel', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [dueTask({ channel_id: 'gone', failure_count: 4 })] })
        .mockResolvedValueOnce(CLAIM_WON);

      await scheduler.runSchedulerTick();

      const update = queryMatching('enabled = false');
      expect(update).toBeDefined();
      expect(String(update![0])).toContain('failure_count');
    });

    it('anchors the next run on the scheduled time, not on now, so it does not drift', async () => {
      const due = new Date('2026-01-01T00:00:00Z');
      mockQuery
        .mockResolvedValueOnce({ rows: [dueTask({ next_run: due, interval_minutes: 60 })] })
        .mockResolvedValueOnce(CLAIM_WON);

      await scheduler.runSchedulerTick();

      const claim = queryMatching('UPDATE scheduled_messages SET next_run');
      const scheduled = new Date(claim![1][1] as Date).getTime();
      // Exactly on the hour grid from the original due time, whenever it ran.
      expect((scheduled - due.getTime()) % (60 * 60 * 1000)).toBe(0);
    });
  });

  describe('parseVariables', () => {
    it('should replace {server} with guild name', async () => {
      const mockTask = {
        id: 1,
        guild_id: 'guild-123',
        channel_id: 'channel-1',
        message: 'Welcome to {server}!',
        embed: false,
        interval_minutes: 60,
        next_run: new Date(),
        enabled: true,
      };
      
      mockQuery
        .mockResolvedValueOnce({ rows: [mockTask] })
        .mockResolvedValueOnce(CLAIM_WON);

      await scheduler.runSchedulerTick();

      expect(mockChannelSend).toHaveBeenCalledWith('Welcome to Test Server!');
    });

    it('should replace {memberCount} with member count', async () => {
      const mockTask = {
        id: 1,
        guild_id: 'guild-123',
        channel_id: 'channel-1',
        message: 'We have {memberCount} members!',
        embed: false,
        interval_minutes: 60,
        next_run: new Date(),
        enabled: true,
      };
      
      mockQuery
        .mockResolvedValueOnce({ rows: [mockTask] })
        .mockResolvedValueOnce(CLAIM_WON);

      await scheduler.runSchedulerTick();

      expect(mockChannelSend).toHaveBeenCalledWith('We have 100 members!');
    });
  });

  describe('auto-delete error handling', () => {
    const testChannelId = 'ad-test-channel';

    function setupFailingChannel(fetchError: Error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockGuild.channels.cache as Map<string, any>).set(testChannelId, {
        id: testChannelId,
        isTextBased: () => true,
        messages: { fetch: jest.fn<any>().mockRejectedValue(fetchError) },
      });
    }

    function setupAutoDeleteRows() {
      mockQuery.mockImplementation((sql: unknown) => {
        if (typeof sql === 'string' && sql.includes('SELECT * FROM auto_delete_channels')) {
          return Promise.resolve({ rows: [{ id: 42, guild_id: 'guild-123', channel_id: testChannelId, max_age_hours: 24, max_messages: null, exempt_roles: [] }] });
        }
        return Promise.resolve({ rows: [] });
      });
    }

    afterEach(() => {
      mockGuild.channels.cache.delete(testChannelId);
    });

    it('disables the config and warns (no error spam) on a permanent Discord error', async () => {
      const loggerWarnSpy = jest.spyOn(logger, 'warn').mockImplementation((() => logger) as any);
      const loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation((() => logger) as any);

      setupFailingChannel(Object.assign(new Error('Missing Access'), { code: 50001 }));
      setupAutoDeleteRows();

      scheduler.start();
      // Drain the microtask queue: checkAutoDelete → db.query → runAutoDelete → fetch → disable
      for (let i = 0; i < 8; i++) await Promise.resolve();

      // The config row must be disabled so it never retries
      const disableCalls = (mockQuery.mock.calls as [unknown, unknown[]?][])
        .filter(args => typeof args[0] === 'string' && (args[0] as string).includes('SET enabled = FALSE'));
      expect(disableCalls.length).toBe(1);
      expect(disableCalls[0][1]).toEqual([42]);

      // A single warn explains what happened; nothing hits the error log
      const warnCalls = (loggerWarnSpy.mock.calls as [unknown][])
        .filter(args => typeof args[0] === 'string' && (args[0] as string).includes(testChannelId));
      expect(warnCalls.length).toBe(1);
      expect(warnCalls[0][0]).toContain('Missing Access');

      const errorCalls = (loggerErrorSpy.mock.calls as [unknown][])
        .filter(args => typeof args[0] === 'string' && (args[0] as string).includes(testChannelId));
      expect(errorCalls.length).toBe(0);

      loggerWarnSpy.mockRestore();
      loggerErrorSpy.mockRestore();
    });

    it('logs channel_id and error message in a single argument for transient errors', async () => {
      const loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation((() => logger) as any);

      setupFailingChannel(Object.assign(new Error('Internal Server Error'), { code: 500 }));
      setupAutoDeleteRows();

      scheduler.start();
      for (let i = 0; i < 8; i++) await Promise.resolve();

      const errorCalls = (loggerErrorSpy.mock.calls as [unknown, ...unknown[]][])
        .filter(args => typeof args[0] === 'string' && (args[0] as string).includes(testChannelId));

      expect(errorCalls.length).toBeGreaterThan(0);
      // The first (and only) argument must contain the error details so Winston's
      // errors() format cannot swallow them by promoting a second Error argument.
      expect(errorCalls[0][0]).toContain('Internal Server Error');

      // Transient errors must NOT disable the config
      const disableCalls = (mockQuery.mock.calls as [unknown][])
        .filter(args => typeof args[0] === 'string' && (args[0] as string).includes('SET enabled = FALSE'));
      expect(disableCalls.length).toBe(0);

      loggerErrorSpy.mockRestore();
    });
  });
});
