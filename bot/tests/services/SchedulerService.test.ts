/**
 * SchedulerService Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock timers
jest.useFakeTimers();

// Create mock client
const mockQuery = jest.fn();
const mockChannelSend = jest.fn();
const mockGuild = {
  id: 'guild-123',
  name: 'Test Server',
  memberCount: 100,
  channels: {
    cache: new Map([
      ['channel-1', {
        id: 'channel-1',
        send: mockChannelSend.mockResolvedValue({ id: 'msg-1' }),
      }],
    ]),
  },
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
};

// Import SchedulerService
const { SchedulerService } = await import('../../src/services/SchedulerService.js');

describe('SchedulerService', () => {
  let scheduler: InstanceType<typeof SchedulerService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
    
    // @ts-expect-error - Using mock client
    scheduler = new SchedulerService(mockClient);
  });

  afterEach(() => {
    scheduler.stop();
    jest.clearAllTimers();
  });

  describe('start', () => {
    it('should start the check interval', () => {
      scheduler.start();

      expect(mockQuery).toHaveBeenCalled(); // Immediate check
    });

    it('should check for tasks every 60 seconds', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      
      scheduler.start();
      mockQuery.mockClear();

      // Advance time by 60 seconds
      jest.advanceTimersByTime(60 * 1000);

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should clear the interval', () => {
      scheduler.start();
      scheduler.stop();

      mockQuery.mockClear();
      jest.advanceTimersByTime(120 * 1000);

      // Query should not be called after stop
      expect(mockQuery).not.toHaveBeenCalled();
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
        .mockResolvedValueOnce({ rows: [] }); // UPDATE last_run

      scheduler.start();
      await Promise.resolve(); // Let promises resolve

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
      
      mockQuery.mockResolvedValueOnce({ rows: [mockTask] });

      scheduler.start();
      await Promise.resolve();

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
      
      mockQuery.mockResolvedValueOnce({ rows: [mockTask] });

      scheduler.start();
      await Promise.resolve();

      expect(mockChannelSend).not.toHaveBeenCalled();
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
        .mockResolvedValueOnce({ rows: [] });

      scheduler.start();
      await Promise.resolve();

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
        .mockResolvedValueOnce({ rows: [] });

      scheduler.start();
      await Promise.resolve();

      expect(mockChannelSend).toHaveBeenCalledWith('We have 100 members!');
    });
  });

  describe('createScheduledMessage', () => {
    it('should create a scheduled message with interval', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const id = await scheduler.createScheduledMessage(
        'guild-123',
        'channel-1',
        'Test message',
        { intervalMinutes: 60, createdBy: 'user-1' }
      );

      expect(id).toBe(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scheduled_messages'),
        expect.arrayContaining(['guild-123', 'channel-1', 'Test message'])
      );
    });

    it('should throw without scheduling options', async () => {
      await expect(
        scheduler.createScheduledMessage(
          'guild-123',
          'channel-1',
          'Test',
          { createdBy: 'user-1' }
        )
      ).rejects.toThrow('Must specify runAt, intervalMinutes, or cronExpression');
    });
  });

  describe('deleteScheduledMessage', () => {
    it('should delete and return true when found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] });

      const result = await scheduler.deleteScheduledMessage('guild-123', 1);

      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const result = await scheduler.deleteScheduledMessage('guild-123', 999);

      expect(result).toBe(false);
    });
  });
});
