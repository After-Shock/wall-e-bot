import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { db } from '../db/index.js';
import { redis } from '../redis.js';
import { guildsRouter } from './guilds.js';
import { NOT_A_CATEGORY } from '../utils/discordChannels.js';

after(() => redis.disconnect());

const guildId = '12345678901234567';
const openCategoryId = '32345678901234567';
const closedCategoryId = '42345678901234567';

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

function installMocks(t: test.TestContext, channelType: number) {
  t.mock.method(redis, 'get', async () => JSON.stringify([
    { id: guildId, name: 'Guild', icon: null, owner: true, permissions: '0' },
  ]));
  t.mock.method(redis, 'setex', async () => 'OK');
  t.mock.method(redis as any, 'incrWithTtl', async () => [1, 60]);
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ guild_id: guildId, type: channelType }), { status: 200 }));

  // Emulates the UPDATE: CASE WHEN $9/$10/$11 decides whether each category column changes.
  const panel = { id: 1, guild_id: guildId, category_open_id: openCategoryId as string | null, category_closed_id: null as string | null, overflow_category_id: null as string | null };
  t.mock.method(db, 'query', async (sql: string, params: any[] = []) => {
    if (!sql.includes('UPDATE ticket_panels')) return { rows: [] } as any;
    if (params[8]) panel.category_open_id = params[4];
    if (params[9]) panel.category_closed_id = params[5];
    if (params[10]) panel.overflow_category_id = params[6];
    return { rows: [{ ...panel }] } as any;
  });
  return panel;
}

test('saving one panel category keeps the others', async (t) => {
  const panel = installMocks(t, 4);

  const response = await request(buildApp())
    .put(`/api/guilds/${guildId}/ticket-panels/1`)
    .send({ category_closed_id: closedCategoryId });

  assert.equal(response.status, 200);
  assert.equal(panel.category_open_id, openCategoryId);
  assert.equal(panel.category_closed_id, closedCategoryId);
});

test('a panel category must be a Discord category', async (t) => {
  const panel = installMocks(t, 0);

  const response = await request(buildApp())
    .put(`/api/guilds/${guildId}/ticket-panels/1`)
    .send({ category_open_id: '52345678901234567' });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, NOT_A_CATEGORY);
  assert.equal(panel.category_open_id, openCategoryId);
});
