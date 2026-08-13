/**
 * Temp-ban expiry: SchedulerService.checkTempBans unbans due bans and
 * only marks a ban resolved when the unban actually succeeded (or the user
 * was already unbanned).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { SchedulerService } from '../../src/services/SchedulerService.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUnban = jest.fn<any>();

const mockGuild = { id: 'guild-123', members: { unban: mockUnban } };
const mockClient = {
  db: { pool: { query: mockQuery } },
  guilds: { cache: new Map([['guild-123', mockGuild]]) },
};

// @ts-expect-error - partial mock client is enough for checkTempBans
const scheduler = new SchedulerService(mockClient);
// checkTempBans is private; reach it directly for the unit under test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const checkTempBans = () => (scheduler as any).checkTempBans();

const markedResolved = () =>
  (mockQuery.mock.calls as [unknown, unknown[]][])
    .filter(([sql]) => typeof sql === 'string' && sql.includes('SET unbanned = true'));

describe('checkTempBans', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('unbans a due ban and marks it resolved', async () => {
    mockUnban.mockResolvedValue(undefined);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 7, guild_id: 'guild-123', user_id: 'user-9' }] })
      .mockResolvedValueOnce({ rows: [] });

    await checkTempBans();

    expect(mockUnban).toHaveBeenCalledWith('user-9', 'Temp ban expired');
    expect(markedResolved()).toHaveLength(1);
    expect(markedResolved()[0][1]).toEqual([7]);
  });

  it('marks resolved when the user was already unbanned (Unknown Ban 10026)', async () => {
    mockUnban.mockRejectedValue({ code: 10026 });
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 8, guild_id: 'guild-123', user_id: 'user-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await checkTempBans();

    expect(markedResolved()).toHaveLength(1);
  });

  it('does NOT mark resolved on other failures, so it retries next tick', async () => {
    mockUnban.mockRejectedValue({ code: 50013 }); // Missing Permissions
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 9, guild_id: 'guild-123', user_id: 'user-2' }] });

    await checkTempBans();

    expect(markedResolved()).toHaveLength(0);
  });
});
