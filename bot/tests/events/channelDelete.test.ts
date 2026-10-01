import { describe, expect, it, jest } from '@jest/globals';
import channelDelete from '../../src/events/channelDelete.js';

function client() {
  const query = jest.fn<(sql: string, params: unknown[]) => Promise<any>>().mockResolvedValue({ rowCount: 1 });
  return { query, client: { db: { pool: { query } } } as any };
}

describe('channelDelete', () => {
  it('closes the open ticket whose channel was deleted', async () => {
    const { query, client: c } = client();

    await channelDelete.execute(c, { id: 'chan-1', guildId: 'guild-1' } as any);

    expect(query).toHaveBeenCalledWith(expect.stringContaining("status IN ('open', 'claimed')"), ['guild-1', 'chan-1']);
    expect(query.mock.calls[0][0]).toContain("status = 'closed'");
  });

  it('ignores DM channels', async () => {
    const { query, client: c } = client();

    await channelDelete.execute(c, { id: 'dm-1' } as any);

    expect(query).not.toHaveBeenCalled();
  });
});
