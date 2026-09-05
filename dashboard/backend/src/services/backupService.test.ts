import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.js';
import { redis } from '../redis.js';
import { createBackup, getBackup, restoreBackup } from './backupService.js';

after(() => redis.disconnect());

test('manual snapshot round trip stores only guild JSON configuration', async (t) => {
  const guildId = '12345678901234567';
  const config = { prefix: '?', modules: { welcome: true } };
  let storedRow: Record<string, any> | undefined;

  t.mock.method(db, 'query', async (sql: string, params?: any[]) => {
    if (sql.includes('SELECT config FROM guild_configs')) {
      return { rows: [{ config }] } as any;
    }
    if (sql.includes('INSERT INTO guild_backups')) {
      storedRow = {
        id: 'backup-1', guild_id: guildId, name: params![1], type: params![2],
        size: params![3], created_at: new Date('2026-09-04T12:00:00Z'),
        created_by: params![4], data: params![5],
      };
      return { rows: [storedRow] } as any;
    }
    if (sql.includes('FROM guild_backups')) {
      return { rows: storedRow ? [storedRow] : [] } as any;
    }
    return { rows: [] } as any;
  });

  // A stale caller supplying retired capture options must not widen new data.
  const created = await (createBackup as any)(guildId, 'Before changes', 'user-1', {
    includeRoles: true,
    includeChannels: true,
    includeMembers: true,
  });
  const read = await getBackup(created.id, guildId);

  assert.deepEqual(created.data, { config });
  assert.deepEqual(read?.data, { config });
  assert.deepEqual(storedRow?.data, { config });
  assert.equal(created.type, 'manual');
});

test('snapshot restore rejects a backup belonging to another guild before writing', async (t) => {
  const queries: Array<{ sql: string; params?: any[] }> = [];
  t.mock.method(db, 'query', async (sql: string, params?: any[]) => {
    queries.push({ sql, params });
    return { rows: [] } as any;
  });

  await assert.rejects(
    restoreBackup('other-guild-backup', '12345678901234567'),
    /Backup not found/,
  );
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /WHERE id = \$1 AND guild_id = \$2/);
  assert.deepEqual(queries[0].params, ['other-guild-backup', '12345678901234567']);
  assert.equal(queries.some(({ sql }) => sql.includes('UPDATE guild_configs')), false);
});

test('existing snapshot rows with legacy capture fields remain readable', async (t) => {
  const legacyData = {
    config: { prefix: '!' },
    roles: [{ id: 'legacy-role' }],
    channels: [{ id: 'legacy-channel' }],
    members: [{ id: 'legacy-member' }],
    messages: [{ id: 'legacy-message' }],
  };
  t.mock.method(db, 'query', async () => ({ rows: [{
    id: 'legacy-backup', guild_id: '12345678901234567', name: 'Old row',
    type: 'automatic', size: 100, created_at: new Date(), created_by: null,
    data: legacyData,
  }] }) as any);

  const snapshot = await getBackup('legacy-backup', '12345678901234567');

  assert.deepEqual(snapshot?.data, legacyData);
  assert.equal(snapshot?.type, 'automatic');
});

test('snapshot restore invalidates the exact guild configuration cache key', async (t) => {
  const guildId = '12345678901234567';
  const deleted: string[] = [];
  const staleCache = new Set([`guild:${guildId}:config`]);
  let queryCount = 0;
  t.mock.method(db, 'query', async () => {
    queryCount++;
    if (queryCount === 1) {
      return { rows: [{
        id: 'backup-1', guild_id: guildId, name: 'snapshot', type: 'manual', size: 1,
        created_at: new Date(), created_by: 'user-1', data: { config: { prefix: '?' } },
      }] } as any;
    }
    return { rows: [] } as any;
  });
  t.mock.method(redis, 'del', async (...keys: string[]) => {
    deleted.push(...keys);
    let removed = 0;
    for (const key of keys) if (staleCache.delete(key)) removed++;
    return removed;
  });

  const cacheInvalidated = await restoreBackup('backup-1', guildId);

  assert.equal(cacheInvalidated, true);
  assert.deepEqual(deleted, [`guild:${guildId}:config`]);
  assert.equal(staleCache.has(`guild:${guildId}:config`), false);
});
