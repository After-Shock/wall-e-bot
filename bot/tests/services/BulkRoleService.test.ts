import { describe, expect, it, jest } from '@jest/globals';
import { BulkRoleService } from '../../src/services/BulkRoleService.js';

function member(id: string, roleIds: string[], bot = false, add?: jest.Mock<any>) {
  return {
    id,
    user: { bot },
    joinedAt: new Date('2026-06-01'),
    roles: {
      cache: new Map(roleIds.map(r => [r, {}])),
      add: add ?? jest.fn<any>().mockResolvedValue(undefined),
      remove: jest.fn<any>().mockResolvedValue(undefined),
    },
  };
}

function setup(members: any[], jobOverrides: Record<string, unknown> = {}, statusAfterProgress = 'running') {
  const job = {
    id: 1, guild_id: 'g1', role_id: 'r1', operation: 'add', filter_type: 'humans', filter_role_ids: [],
    require_all: false, joined_at: null, notify_channel_id: 'notify', status: 'queued', started_by: 'u1',
    changed: 0, failed: 0, ...jobOverrides,
  };
  const updates: { sql: string; params: unknown[] }[] = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('SELECT * FROM bulk_role_jobs')) return { rows: [job] };
    updates.push({ sql, params });
    if (sql.includes('RETURNING status')) return { rows: [{ status: statusAfterProgress }] };
    return { rows: [] };
  });
  const send = jest.fn<any>().mockResolvedValue(undefined);
  const guild = {
    roles: { cache: new Map([['r1', { name: 'Member', editable: true }]]) },
    members: { fetch: jest.fn<any>().mockResolvedValue(new Map(members.map(m => [m.id, m]))) },
    channels: { cache: new Map([['notify', { isTextBased: () => true, send }]]) },
  };
  const client = { db: { pool: { query } }, guilds: { cache: new Map([['g1', guild]]) } } as any;
  return { service: new BulkRoleService(client), updates, send };
}

const finished = async (service: BulkRoleService) => {
  // start() runs in the background; wait for the in-flight set to drain.
  for (let i = 0; i < 50 && (service as any).running.size > 0; i++) await new Promise(r => setTimeout(r, 5));
};

describe('BulkRoleService', () => {
  it('adds the role only to matching members who lack it, then reports', async () => {
    const human = member('h1', []);
    const already = member('h2', ['r1']);
    const bot = member('b1', [], true);
    const { service, updates, send } = setup([human, already, bot]);

    service.start(1);
    await finished(service);

    expect(human.roles.add).toHaveBeenCalledWith('r1', 'Bulk role job #1');
    expect(already.roles.add).not.toHaveBeenCalled();
    expect(bot.roles.add).not.toHaveBeenCalled();
    expect(updates.at(-1)!.params).toEqual([1, 'done', null]);
    expect(send.mock.calls[0][0]).toMatchObject({ allowedMentions: { parse: [] } });
  });

  it('counts failures and keeps going', async () => {
    const broken = member('h1', [], false, jest.fn<any>().mockRejectedValue(new Error('Missing Permissions')));
    const fine = member('h2', []);
    const { service, updates } = setup([broken, fine]);

    service.start(1);
    await finished(service);

    expect(fine.roles.add).toHaveBeenCalled();
    const progress = updates.find(u => u.sql.includes('RETURNING status'))!;
    expect(progress.params).toEqual([1, 2, 1, 1]); // processed, changed, failed
  });

  it('stops when the job is cancelled', async () => {
    const members = Array.from({ length: 25 }, (_, i) => member(`h${i}`, []));
    const { service, updates } = setup(members, {}, 'cancelling');

    service.start(1);
    await finished(service);

    const added = members.filter(m => (m.roles.add as jest.Mock).mock.calls.length > 0).length;
    expect(added).toBe(10);
    expect(updates.at(-1)!.params).toEqual([1, 'cancelled', null]);
  });

  it('fails clearly when the role is above Wall-E', async () => {
    const { service, updates } = setup([member('h1', [])]);
    (service as any).client.guilds.cache.get('g1').roles.cache.get('r1').editable = false;

    service.start(1);
    await finished(service);

    expect(updates.at(-1)!.params[1]).toBe('failed');
    expect(String(updates.at(-1)!.params[2])).toContain("above Wall-E's highest role");
  });
});
