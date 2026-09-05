import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.js';
import { redis } from '../redis.js';
import { restoreBackup } from './backupService.js';

after(() => redis.disconnect());

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
