import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.js';
import { updateConfigSection } from './guildConfigService.js';

test('updateConfigSection returns the updated section rather than the SQL row wrapper', async (t) => {
  t.mock.method(db, 'query', async () => ({
    rows: [{ updated_section: { enabled: true, message: 'Hello' } }],
  }) as any);

  const updated = await updateConfigSection<{ enabled: boolean; message: string }>(
    'guild-1',
    'welcome',
    { enabled: true },
  );

  assert.deepEqual(updated, { enabled: true, message: 'Hello' });
});
