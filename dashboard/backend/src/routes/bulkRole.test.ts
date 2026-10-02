import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { db } from '../db/index.js';
import { redis } from '../redis.js';
import { bulkRoleRouter } from './bulkRole.js';

after(() => redis.disconnect());

const guildId = '12345678901234567';
const roleId = '22345678901234567';
const botRoleId = '32345678901234567';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: '42345678901234567', username: 't', discriminator: '0', avatar: null, email: null,
      accessToken: 'a', refreshToken: 'r' } as any;
    next();
  });
  app.use('/api/guilds/:guildId/bulk-role', bulkRoleRouter);
  return app;
}

function mocks(t: test.TestContext, query: (sql: string, params: any[]) => any = () => ({ rows: [{ id: 1 }] })) {
  t.mock.method(redis, 'get', async () => JSON.stringify([{ id: guildId, name: 'G', icon: null, owner: true, permissions: '0' }]));
  t.mock.method(redis, 'setex', async () => 'OK');
  t.mock.method(redis as any, 'incrWithTtl', async () => [1, 60]);
  const published: string[] = [];
  t.mock.method(redis, 'publish', async (_c: string, m: string) => { published.push(m); return 1; });
  // Discord: the target role sits below Wall-E's role.
  t.mock.method(globalThis, 'fetch', async (url: string) => String(url).endsWith('/roles')
    ? new Response(JSON.stringify([{ id: roleId, name: 'Member', position: 1, managed: false },
        { id: botRoleId, name: 'wall-e', position: 5, managed: false }]), { status: 200 })
    : new Response(JSON.stringify({ roles: [botRoleId] }), { status: 200 }));
  const queries: { sql: string; params: any[] }[] = [];
  t.mock.method(db, 'query', async (sql: string, params: any[] = []) => { queries.push({ sql, params }); return query(sql, params); });
  return { published, queries };
}

test('queues a job and triggers the bot', async (t) => {
  const { published, queries } = mocks(t);

  const res = await request(buildApp()).post(`/api/guilds/${guildId}/bulk-role`)
    .send({ role_id: roleId, operation: 'add', filter_type: 'humans' });

  assert.equal(res.status, 201);
  assert.deepEqual(JSON.parse(published[0]), { jobId: 1 });
  const insert = queries.find(q => q.sql.includes('INSERT INTO bulk_role_jobs'))!;
  assert.deepEqual(insert.params.slice(0, 7), [guildId, roleId, 'add', 'humans', [], false, null]);
});

test('rejects @everyone, missing filter roles and missing dates', async (t) => {
  mocks(t);
  const post = (body: object) => request(buildApp()).post(`/api/guilds/${guildId}/bulk-role`).send(body);

  assert.equal((await post({ role_id: guildId, operation: 'add', filter_type: 'all' })).status, 400);
  assert.equal((await post({ role_id: roleId, operation: 'add', filter_type: 'has_roles' })).status, 400);
  assert.equal((await post({ role_id: roleId, operation: 'remove', filter_type: 'joined_before' })).status, 400);
});

test('only one active job per server', async (t) => {
  mocks(t, sql => {
    if (sql.includes('INSERT')) throw Object.assign(new Error('duplicate'), { code: '23505' });
    return { rows: [] };
  });

  const res = await request(buildApp()).post(`/api/guilds/${guildId}/bulk-role`)
    .send({ role_id: roleId, operation: 'add', filter_type: 'all' });

  assert.equal(res.status, 409);
});

test('cancel only touches an active job in this server', async (t) => {
  const { queries } = mocks(t, () => ({ rows: [] }));

  const res = await request(buildApp()).post(`/api/guilds/${guildId}/bulk-role/7/cancel`);

  assert.equal(res.status, 404);
  assert.deepEqual(queries.at(-1)!.params, ['7', guildId]);
  assert.match(queries.at(-1)!.sql, /status IN \('queued', 'running'\)/);
});
