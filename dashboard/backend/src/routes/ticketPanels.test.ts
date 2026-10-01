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

test('panel list includes each category\'s questions', async (t) => {
  installMocks(t, 4);
  t.mock.method(db, 'query', async (sql: string) => {
    if (sql.includes('FROM ticket_panels')) return { rows: [{ id: 1, guild_id: guildId }] } as any;
    if (sql.includes('FROM ticket_categories')) return { rows: [{ id: 7, panel_id: 1 }] } as any;
    if (sql.includes('FROM ticket_form_fields')) {
      return { rows: [{ id: 3, category_id: 7, label: 'User name?', placeholder: 'jsmith42', position: 0 }] } as any;
    }
    return { rows: [] } as any;
  });

  const response = await request(buildApp()).get(`/api/guilds/${guildId}/ticket-panels`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body[0].categories[0].form_fields.map((f: any) => f.placeholder), ['jsmith42']);
});

test('updating a question only changes its placeholder when one is sent', async (t) => {
  installMocks(t, 4);
  const field = { id: 3, label: 'User name?', placeholder: 'jsmith42' as string | null };
  t.mock.method(db, 'query', async (sql: string, params: any[] = []) => {
    if (!sql.includes('UPDATE ticket_form_fields')) return { rows: [] } as any;
    if (params[1] != null) field.label = params[1];
    if (params[9]) field.placeholder = params[2];
    return { rows: [{ ...field }] } as any;
  });

  const relabel = await request(buildApp())
    .put(`/api/guilds/${guildId}/ticket-form-fields/3`)
    .send({ label: 'OhanaTV user name?' });
  assert.equal(relabel.status, 200);
  assert.equal(field.placeholder, 'jsmith42');

  const tooLong = await request(buildApp())
    .put(`/api/guilds/${guildId}/ticket-form-fields/3`)
    .send({ placeholder: 'x'.repeat(101) });
  assert.equal(tooLong.status, 400);
  assert.equal(field.placeholder, 'jsmith42');
});

test('server emoji list is formatted for Discord text and skips unavailable ones', async (t) => {
  installMocks(t, 4);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify([
    { id: '62345678901234567', name: 'sully', animated: false },
    { id: '72345678901234567', name: 'dance', animated: true },
    { id: '82345678901234567', name: 'boosted', available: false },
  ]), { status: 200 }));

  const response = await request(buildApp()).get(`/api/guilds/${guildId}/emojis`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.map((e: any) => e.value), ['<:sully:62345678901234567>', '<a:dance:72345678901234567>']);
});

test('saving category roles keeps its emoji and description', async (t) => {
  installMocks(t, 4);
  const category = { id: 7, emoji: '<:sully:62345678901234567>' as string | null, description: 'Renewals' as string | null };
  t.mock.method(db, 'query', async (sql: string, params: any[] = []) => {
    if (!sql.includes('UPDATE ticket_categories')) return { rows: [] } as any;
    if (params[8]) category.emoji = params[3];
    if (params[9]) category.description = params[4];
    return { rows: [{ ...category }] } as any;
  });

  const response = await request(buildApp())
    .put(`/api/guilds/${guildId}/ticket-categories/7`)
    .send({ support_role_ids: ['92345678901234567'] });

  assert.equal(response.status, 200);
  assert.equal(category.emoji, '<:sully:62345678901234567>');
  assert.equal(category.description, 'Renewals');
});

test('sent panel uses the panel title and description like Ticket Tool', async (t) => {
  installMocks(t, 0);
  let posted: any;
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/messages')) {
      posted = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: '11345678901234567', channel_id: '12345678901234568' }), { status: 200 });
    }
    return new Response(JSON.stringify({ guild_id: guildId, type: 0 }), { status: 200 });
  });
  t.mock.method(db, 'query', async (sql: string) => {
    if (sql.includes('FROM ticket_panels p')) {
      return { rows: [{
        id: 1, name: 'OhanaTV Support', description: 'To create a ticket use the appropriate button below:',
        panel_type: 'buttons', panel_channel_id: null, panel_message_id: null,
        categories: [{ id: 7, name: 'Renewal Ticket', emoji: '<:sully:62345678901234567>', description: null }],
      }] } as any;
    }
    return { rows: [] } as any;
  });

  const response = await request(buildApp())
    .post(`/api/guilds/${guildId}/ticket-panels/1/send`)
    .send({ channel_id: '12345678901234568' });

  assert.equal(response.status, 200);
  assert.equal(posted.embeds[0].title, 'OhanaTV Support');
  assert.equal(posted.embeds[0].description, 'To create a ticket use the appropriate button below:');
  assert.deepEqual(posted.components[0].components[0].emoji, { id: '62345678901234567', name: 'sully', animated: false });
});

test('panel description saves without touching the title, and titles cannot be blank', async (t) => {
  installMocks(t, 4);
  let params: any[] = [];
  t.mock.method(db, 'query', async (sql: string, p: any[] = []) => {
    if (sql.includes('UPDATE ticket_panels')) params = p;
    return { rows: [{ id: 1 }] } as any;
  });

  const ok = await request(buildApp())
    .put(`/api/guilds/${guildId}/ticket-panels/1`)
    .send({ description: '  Pick a button  ' });
  assert.equal(ok.status, 200);
  assert.equal(params[2], undefined); // name untouched (COALESCE keeps it)
  assert.equal(params[11], 'Pick a button');
  assert.equal(params[12], true);

  const blank = await request(buildApp())
    .put(`/api/guilds/${guildId}/ticket-panels/1`)
    .send({ name: '   ' });
  assert.equal(blank.status, 400);
});
