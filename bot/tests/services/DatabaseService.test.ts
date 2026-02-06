/**
 * DatabaseService Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock pg module before importing DatabaseService
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockRelease = jest.fn();
const mockEnd = jest.fn();

jest.unstable_mockModule('pg', () => ({
  default: {
    Pool: jest.fn().mockImplementation(() => ({
      query: mockQuery,
      connect: mockConnect.mockResolvedValue({
        query: mockQuery,
        release: mockRelease,
      }),
      end: mockEnd,
    })),
  },
}));

// Import after mocking
const { DatabaseService } = await import('../../src/services/DatabaseService.js');

describe('DatabaseService', () => {
  let db: InstanceType<typeof DatabaseService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{ now: new Date() }] });
    
    db = new DatabaseService();
    await db.connect();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('connect', () => {
    it('should establish database connection', async () => {
      expect(mockQuery).toHaveBeenCalledWith('SELECT NOW()');
    });

    it('should throw on connection failure', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection failed'));
      const newDb = new DatabaseService();
      
      await expect(newDb.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('getGuildConfig', () => {
    it('should return guild config when found', async () => {
      const mockConfig = { guild_id: '123', config: '{}' };
      mockQuery.mockResolvedValueOnce({ rows: [mockConfig] });

      const result = await db.getGuildConfig('123');

      expect(result).toEqual(mockConfig);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM guild_configs WHERE guild_id = $1',
        ['123']
      );
    });

    it('should return null when guild not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await db.getGuildConfig('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('addXp', () => {
    it('should add XP to existing member', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ xp: 150, level: 1, total_xp: 150 }],
      });

      const result = await db.addXp('guild-1', 'user-1', 50);

      expect(result.newXp).toBe(150);
      expect(result.leveledUp).toBe(false);
    });

    it('should create new member if not exists', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // UPDATE returns nothing
        .mockResolvedValueOnce({ rows: [] }); // INSERT

      const result = await db.addXp('guild-1', 'new-user', 25);

      expect(result).toEqual({ newXp: 25, newLevel: 0, leveledUp: false });
    });

    it('should detect level up', async () => {
      // User at level 0 with 99 XP, gains 2 XP to reach 101 total
      // Level formula: floor(0.1 * sqrt(total_xp))
      // sqrt(101) ≈ 10.05, * 0.1 = 1.005, floor = 1
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ xp: 101, level: 0, total_xp: 101 }],
        })
        .mockResolvedValueOnce({ rows: [] }); // Level update

      const result = await db.addXp('guild-1', 'user-1', 2);

      expect(result.leveledUp).toBe(true);
      expect(result.newLevel).toBe(1);
    });
  });

  describe('addWarning', () => {
    it('should add warning and return count', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }); // COUNT

      const count = await db.addWarning('guild-1', 'user-1', 'mod-1', 'Spam');

      expect(count).toBe(3);
    });
  });

  describe('getLeaderboard', () => {
    it('should return sorted leaderboard', async () => {
      const mockLeaderboard = [
        { userId: 'user-1', xp: 1000, level: 10 },
        { userId: 'user-2', xp: 500, level: 7 },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockLeaderboard });

      const result = await db.getLeaderboard('guild-1', 10);

      expect(result).toEqual(mockLeaderboard);
      expect(result[0].xp).toBeGreaterThan(result[1].xp);
    });

    it('should respect limit parameter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await db.getLeaderboard('guild-1', 5);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        ['guild-1', 5]
      );
    });
  });

  describe('close', () => {
    it('should close the connection pool', async () => {
      await db.close();

      expect(mockEnd).toHaveBeenCalled();
    });
  });
});
