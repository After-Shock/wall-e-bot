import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { db } from '../db/index.js';
import { redis } from '../redis.js';
import { guildsRouter } from './guilds.js';

after(() => redis.disconnect());

const guildId = '12345678901234567';

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

function installAccessMocks(t: test.TestContext) {
  t.mock.method(redis, 'get', async () => JSON.stringify([
    { id: guildId, name: 'Guild', icon: null, owner: true, permissions: '0' },
  ]));
  t.mock.method(redis, 'setex', async () => 'OK');
  t.mock.method(redis as any, 'incrWithTtl', async () => [1, 60]);
}

test('obsolete snapshot config routes return an explicit unsupported response', async (t) => {
  installAccessMocks(t);
  const queries: string[] = [];
  t.mock.method(db, 'query', async (sql: string) => {
    queries.push(sql);
    return { rows: [] } as any;
  });

  for (const response of [
    await request(buildApp()).get(`/api/guilds/${guildId}/backups/config`),
    await request(buildApp()).patch(`/api/guilds/${guildId}/backups/config`).send({ autoBackup: true }),
  ]) {
    assert.equal(response.status, 410);
    assert.deepEqual(response.body, {
      error: 'Automatic backup configuration is no longer supported',
    });
  }
  assert.equal(queries.length, 0, 'config must not fall through to backup lookup');
});

test('manual snapshot creation rejects retired capture options', async (t) => {
  installAccessMocks(t);
  const queries: string[] = [];
  t.mock.method(db, 'query', async (sql: string) => {
    queries.push(sql);
    return { rows: [] } as any;
  });

  const response = await request(buildApp())
    .post(`/api/guilds/${guildId}/backups`)
    .send({ name: 'Before changes', includeRoles: true });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: 'Unsupported snapshot options',
    message: 'Configuration snapshots accept only a name',
  });
  assert.equal(queries.length, 0);
});
