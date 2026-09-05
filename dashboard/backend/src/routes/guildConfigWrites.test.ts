import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { db } from '../db/index.js';
import { redis } from '../redis.js';
import { guildsRouter } from './guilds.js';

after(() => redis.disconnect());

const guildId = '12345678901234567';
const sourceGuildId = '22345678901234567';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = {
      id: 'user-1', username: 'tester', discriminator: '0001', avatar: null,
      email: null, accessToken: 'access', refreshToken: 'refresh',
    } as any;
    next();
  });
  app.use('/api/guilds', guildsRouter);
  return app;
}

function installRedisMocks(t: test.TestContext, deletedKeys: string[]) {
  const cache = new Set([`guild:${guildId}:config`]);
  t.mock.method(redis, 'get', async () => JSON.stringify([
    { id: guildId, name: 'Guild', icon: null, owner: true, permissions: '0' },
    { id: sourceGuildId, name: 'Source', icon: null, owner: true, permissions: '0' },
  ]));
  t.mock.method(redis, 'setex', async () => 'OK');
  t.mock.method(redis as any, 'incrWithTtl', async () => [1, 60]);
  t.mock.method(redis, 'del', async (...keys: string[]) => {
    deletedKeys.push(...keys);
    let removed = 0;
    for (const key of keys) if (cache.delete(key)) removed++;
    return removed;
  });
  return cache;
}

test('legacy PATCH merges module flags and preserves existing configuration', async (t) => {
  const deletedKeys: string[] = [];
  const staleCache = installRedisMocks(t, deletedKeys);
  let config: Record<string, any> = {
    prefix: '?', language: 'fr', timezone: 'Europe/Paris',
    modules: { welcome: false, leveling: true, moderation: true },
    welcome: { enabled: true, message: 'Bonjour', embedEnabled: false, dmEnabled: false, leaveEnabled: false },
    leveling: { enabled: true, xpPerMessage: { min: 3, max: 7 }, xpCooldown: 60, levelUpMessage: 'Level!', roleRewards: [], ignoredChannels: [], ignoredRoles: [], xpMultipliers: [] },
    unrelated: { retained: true },
  };

  t.mock.method(db, 'query', async (sql: string, params?: any[]) => {
    if (!sql.includes('INSERT INTO guild_configs')) return { rows: [] } as any;
    const updates = JSON.parse(params![1]);
    if (sql.includes('RETURNING config')) {
      config = { ...config, ...updates, modules: { ...config.modules, ...(updates.modules ?? {}) } };
      return { rows: [{ config }] } as any;
    }
    config = updates;
    return { rows: [] } as any;
  });

  const response = await request(buildApp())
    .patch(`/api/guilds/${guildId}`)
    .send({ modules: { welcome: true } });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true, data: config });
  assert.equal(config.prefix, '?');
  assert.equal(config.welcome.message, 'Bonjour');
  assert.deepEqual(config.leveling.xpPerMessage, { min: 3, max: 7 });
  assert.deepEqual(config.unrelated, { retained: true });
  assert.deepEqual(config.modules, { welcome: true, leveling: true, moderation: true });
  assert.deepEqual(deletedKeys, [`guild:${guildId}:config`]);
  assert.equal(staleCache.has(`guild:${guildId}:config`), false);

  const invalid = await request(buildApp())
    .patch(`/api/guilds/${guildId}`)
    .send({ moderation: { warnThresholds: { kick: 2 } } });
  assert.equal(invalid.status, 400);
});

const sourceConfig = {
  prefix: '$', language: 'de', timezone: 'Europe/Berlin',
  modules: { welcome: true, leveling: false, moderation: false, automod: true, logging: true },
  welcome: { enabled: true, channelId: '33345678901234567', message: 'Hallo' },
  leveling: { enabled: false, levelUpChannel: '43345678901234567', xpPerMessage: { min: 1, max: 2 } },
  moderation: { modLogChannelId: '53345678901234567', warnThresholds: { kick: 2, ban: 4 } },
  automod: {
    enabled: true,
    ignoredChannels: ['63345678901234567'],
    raidProtection: { alertChannel: '73345678901234569' },
  },
  logging: { enabled: true, channelId: '73345678901234567' },
};

const initialTargetConfig = {
  prefix: '!', language: 'en', timezone: 'UTC', authToken: 'target-secret',
  modules: { welcome: false, leveling: true, moderation: true, automod: false, logging: false },
  welcome: { enabled: false, channelId: '83345678901234567', message: 'Welcome' },
  leveling: { enabled: true, levelUpChannel: '93345678901234567', xpPerMessage: { min: 10, max: 20 } },
  moderation: { modLogChannelId: '10345678901234567', warnThresholds: { kick: 3, ban: 5 } },
  automod: { enabled: false, ignoredChannels: ['11345678901234567'] },
  logging: { enabled: false, channelId: '12345678901234568' },
};

async function copyConfigFixture(t: test.TestContext, categories: string[]) {
  const deletedKeys: string[] = [];
  const staleCache = installRedisMocks(t, deletedKeys);
  let target = structuredClone(initialTargetConfig);
  const client = {
    query: async (sql: string, params?: any[]) => {
      if (sql.includes('SELECT config FROM guild_configs')) return { rows: [{ config: structuredClone(sourceConfig) }] };
      if (sql.includes('INSERT INTO guild_configs')) {
        const copied = JSON.parse(params![1]);
        if (sql.includes('SET config = $2')) target = copied;
        else target = { ...target, ...copied, modules: { ...target.modules, ...(copied.modules ?? {}) } };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };
  t.mock.method(db, 'connect', async () => client as any);

  const response = await request(buildApp())
    .post(`/api/guilds/${guildId}/copy-from/${sourceGuildId}`)
    .send({ categories });
  return { response, target, deletedKeys, staleCache };
}

test('general-only copy preserves target moderation and strips IDs only in selected data', async (t) => {
  const { response, target, deletedKeys, staleCache } = await copyConfigFixture(t, ['general']);
  assert.equal(response.status, 200);
  assert.equal(target.prefix, '$');
  assert.equal(target.welcome.channelId, null);
  assert.equal(target.leveling.levelUpChannel, null);
  assert.deepEqual(target.moderation, initialTargetConfig.moderation);
  assert.deepEqual(target.automod, initialTargetConfig.automod);
  assert.deepEqual(target.logging, initialTargetConfig.logging);
  assert.equal(target.authToken, 'target-secret');
  assert.deepEqual(target.modules, { ...initialTargetConfig.modules, welcome: true, leveling: false });
  assert.deepEqual(deletedKeys, [`guild:${guildId}:config`]);
  assert.equal(staleCache.has(`guild:${guildId}:config`), false);
});

test('moderation-only copy preserves target general settings and IDs', async (t) => {
  const { response, target, deletedKeys, staleCache } = await copyConfigFixture(t, ['moderation']);
  assert.equal(response.status, 200);
  assert.equal(target.prefix, '!');
  assert.deepEqual(target.welcome, initialTargetConfig.welcome);
  assert.deepEqual(target.leveling, initialTargetConfig.leveling);
  assert.equal(target.moderation.modLogChannelId, null);
  assert.deepEqual(target.automod.ignoredChannels, []);
  assert.equal((target.automod as any).raidProtection.alertChannel, null);
  assert.equal(target.logging.channelId, '12345678901234568');
  assert.equal(target.authToken, 'target-secret');
  assert.deepEqual(target.modules, { ...initialTargetConfig.modules, moderation: false, automod: true });
  assert.deepEqual(deletedKeys, [`guild:${guildId}:config`]);
  assert.equal(staleCache.has(`guild:${guildId}:config`), false);
});

test('combined copy merges all selected general and moderation sections', async (t) => {
  const { response, target, deletedKeys, staleCache } = await copyConfigFixture(t, ['general', 'moderation']);
  assert.equal(response.status, 200);
  assert.equal(response.body.syncedCount, 2);
  assert.equal(target.prefix, '$');
  assert.equal(target.welcome.channelId, null);
  assert.equal(target.moderation.modLogChannelId, null);
  assert.deepEqual(target.logging, initialTargetConfig.logging);
  assert.equal(target.authToken, 'target-secret');
  assert.deepEqual(target.modules, {
    ...initialTargetConfig.modules,
    welcome: true, leveling: false, moderation: false, automod: true,
  });
  assert.deepEqual(deletedKeys, [`guild:${guildId}:config`]);
  assert.equal(staleCache.has(`guild:${guildId}:config`), false);
});

test('section PATCH returns the authoritative section and rejects incomplete nested updates', async (t) => {
  const deletedKeys: string[] = [];
  const staleCache = installRedisMocks(t, deletedKeys);
  let leveling = {
    enabled: true, xpPerMessage: { min: 10, max: 20 }, xpCooldown: 60,
    levelUpMessage: 'Great!', roleRewards: [], ignoredChannels: [], ignoredRoles: [], xpMultipliers: [],
  };
  t.mock.method(db, 'query', async (sql: string, params?: any[]) => {
    if (sql.includes('RETURNING config -> $2 AS updated_section')) {
      leveling = { ...leveling, ...JSON.parse(params![2]) };
      return { rows: [{ updated_section: leveling }] } as any;
    }
    return { rows: [] } as any;
  });

  const invalid = await request(buildApp())
    .patch(`/api/guilds/${guildId}/config/leveling`)
    .send({ xpPerMessage: { min: 15 } });
  assert.equal(invalid.status, 400);

  const response = await request(buildApp())
    .patch(`/api/guilds/${guildId}/config/leveling`)
    .send({ roleRewards: [] });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true, data: leveling });
  assert.deepEqual(leveling.xpPerMessage, { min: 10, max: 20 });
  assert.deepEqual(deletedKeys, [`guild:${guildId}:config`]);
  assert.equal(staleCache.has(`guild:${guildId}:config`), false);
});

test('general PATCH invalidates the exact cache key and retains its response contract', async (t) => {
  const deletedKeys: string[] = [];
  const staleCache = installRedisMocks(t, deletedKeys);
  t.mock.method(db, 'query', async () => ({ rows: [] }) as any);

  const response = await request(buildApp())
    .patch(`/api/guilds/${guildId}/config/general`)
    .send({ prefix: '?' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { prefix: '?' });
  assert.deepEqual(deletedKeys, [`guild:${guildId}:config`]);
  assert.equal(staleCache.has(`guild:${guildId}:config`), false);
});

test('a bounded cache failure reports persisted settings with delayed bot visibility', async (t) => {
  t.mock.method(redis, 'get', async () => JSON.stringify([
    { id: guildId, name: 'Guild', icon: null, owner: true, permissions: '0' },
  ]));
  t.mock.method(redis, 'setex', async () => 'OK');
  t.mock.method(redis as any, 'incrWithTtl', async () => [1, 60]);
  t.mock.method(redis, 'del', async () => await new Promise<number>(() => {}));
  t.mock.method(db, 'query', async (_sql: string, params?: any[]) => ({
    rows: [{ config: JSON.parse(params![1]) }],
  }) as any);

  const started = Date.now();
  const response = await request(buildApp())
    .patch(`/api/guilds/${guildId}`)
    .send({ modules: { welcome: true } });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.match(response.body.warning, /saved.*previous settings.*cache expires/i);
  assert.ok(Date.now() - started < 1_500, 'cache failure must be time bounded');
});
