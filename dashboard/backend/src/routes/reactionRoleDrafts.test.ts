import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { db } from '../db/index.js';
import { redis } from '../redis.js';
import { guildsRouter } from './guilds.js';

after(() => redis.disconnect());

const guildId = '12345678901234567';
const channelId = '22345678901234567';
const roleId = '32345678901234567';
const botRoleId = '42345678901234567';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: 'u1', username: 't', discriminator: '0', avatar: null, email: null, accessToken: 'a', refreshToken: 'r' } as any;
    next();
  });
  app.use('/api/guilds', guildsRouter);
  return app;
}

function mocks(t: test.TestContext, query: (sql: string, params: any[]) => any) {
  t.mock.method(redis, 'get', async () => JSON.stringify([{ id: guildId, name: 'G', icon: null, owner: true, permissions: '0' }]));
  t.mock.method(redis, 'setex', async () => 'OK');
  t.mock.method(redis as any, 'incrWithTtl', async () => [1, 60]);
  const discord: string[] = [];
  let posted: any;
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    const path = String(url).replace('https://discord.com/api/v10', '');
    const method = init?.method ?? 'GET';
    discord.push(`${method} ${path}`);
    if (method === 'POST') {
      posted = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: '52345678901234567', channel_id: channelId }), { status: 200 });
    }
    if (path.endsWith('/emojis')) return new Response(JSON.stringify([{ id: '9', name: 'sullyflix' }]), { status: 200 });
    if (path.endsWith('/roles')) {
      return new Response(JSON.stringify([{ id: roleId, name: 'Fan', position: 1, managed: false },
        { id: botRoleId, name: 'wall-e', position: 5, managed: false }]), { status: 200 });
    }
    if (path.includes('/members/')) return new Response(JSON.stringify({ roles: [botRoleId] }), { status: 200 });
    return new Response(JSON.stringify({ guild_id: guildId, type: 0 }), { status: 200 });
  });
  const queries: { sql: string; params: any[] }[] = [];
  t.mock.method(db, 'query', async (sql: string, params: any[] = []) => { queries.push({ sql, params }); return query(sql, params) ?? { rows: [] }; });
  const client = { query: async () => ({ rows: [] }), release: () => {} };
  t.mock.method(db, 'connect', async () => client as any);
  return { discord, queries, posted: () => posted };
}

test('a half-built message can be saved as a draft without touching Discord', async (t) => {
  const { discord, queries } = mocks(t, sql => sql.includes('INSERT INTO reaction_role_messages') ? { rows: [{ id: 5 }] } : undefined);

  const res = await request(buildApp()).post(`/api/guilds/${guildId}/reaction-roles/drafts`)
    .send({ title: 'Pick roles', roles: [{ role_id: '', emoji: '', label: '' }] });

  assert.equal(res.status, 201);
  assert.equal(res.body.id, 5);
  assert.deepEqual(discord, []);
  const insert = queries.find(q => q.sql.includes('INSERT INTO reaction_role_messages'))!;
  assert.equal(insert.params[1], null); // no channel yet
});

test('updating a draft only matches unposted messages', async (t) => {
  const { queries } = mocks(t, () => ({ rows: [] }));

  const res = await request(buildApp()).put(`/api/guilds/${guildId}/reaction-roles/drafts/5`).send({ title: 'x' });

  assert.equal(res.status, 404);
  assert.match(queries.at(-1)!.sql, /message_id IS NULL/);
});

test('posting a draft sends a new message, resolves :emoji: and clears the draft', async (t) => {
  const { discord, queries, posted } = mocks(t, sql => sql.includes('SELECT * FROM reaction_role_messages')
    ? { rows: [{ id: 5, channel_id: null, message_id: null }] } : undefined);

  const res = await request(buildApp()).patch(`/api/guilds/${guildId}/reaction-roles/5`).send({
    channel_id: channelId, title: 'Roles', description: 'Pick one :sullyflix:',
    roles: [{ role_id: roleId, emoji: '🎮', label: 'Fan' }],
  });

  assert.equal(res.status, 200);
  assert.ok(discord.includes(`POST /channels/${channelId}/messages`));
  assert.ok(!discord.some(d => d.startsWith('PATCH') || d.startsWith('DELETE')));
  assert.equal(posted().embeds[0].description, 'Pick one <:sullyflix:9>');
  assert.match(queries.find(q => q.sql.includes('UPDATE reaction_role_messages'))!.sql, /draft_roles = NULL/);
});

test('deleting a draft does not call Discord', async (t) => {
  const { discord } = mocks(t, sql => sql.includes('DELETE FROM reaction_role_messages')
    ? { rows: [{ channel_id: null, message_id: null }] } : undefined);

  const res = await request(buildApp()).delete(`/api/guilds/${guildId}/reaction-roles/5`);

  assert.equal(res.status, 200);
  assert.deepEqual(discord, []);
});
