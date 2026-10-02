import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { isBotOwner, parseOwnerIds } from '@wall-e/shared';
import { isGuildAdmin, getUserGuilds, GuildResolutionError } from './userGuilds.js';
import { requireAuth, requireGuildAdmin } from '../middleware/auth.js';
import { redis } from '../redis.js';

// Touching the cache starts ioredis' reconnect loop, which keeps the process
// alive after the assertions finish.
after(() => { redis.disconnect(); });

const MANAGE_GUILD = '32';
const ADMINISTRATOR = '8';
const SEND_MESSAGES = '2048';

test('isGuildAdmin accepts owner, MANAGE_GUILD and ADMINISTRATOR', () => {
  const g = (permissions: string, owner = false) =>
    [{ id: 'g1', name: 'g', icon: null, owner, permissions }];

  assert.equal(isGuildAdmin(g(SEND_MESSAGES, true), 'g1'), true, 'owner');
  assert.equal(isGuildAdmin(g(MANAGE_GUILD), 'g1'), true, 'manage guild');
  assert.equal(isGuildAdmin(g(ADMINISTRATOR), 'g1'), true, 'administrator');
  assert.equal(isGuildAdmin(g(SEND_MESSAGES), 'g1'), false, 'plain member');
  assert.equal(isGuildAdmin(g(ADMINISTRATOR), 'other'), false, 'different guild');
  assert.equal(isGuildAdmin([], 'g1'), false, 'no guilds');
});

test('getUserGuilds throws rather than returning [] when Discord fails', async () => {
  const realFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response('', { status: 401 })) as typeof fetch;
  await assert.rejects(
    () => getUserGuilds({ id: 'u1', accessToken: 'dead' }),
    (e: unknown) => e instanceof GuildResolutionError && e.kind === 'reauth',
    'a rejected token must ask for re-login',
  );

  globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch;
  await assert.rejects(
    () => getUserGuilds({ id: 'u2', accessToken: 'ok' }),
    (e: unknown) => e instanceof GuildResolutionError && e.kind === 'unavailable',
    'a Discord outage must not look like "member of no guilds"',
  );

  globalThis.fetch = realFetch;
});

test('requireGuildAdmin denies when the guild list cannot be resolved', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch;

  const app = express();
  app.get('/guilds/:guildId/x', (req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: 'u3', accessToken: 't' } as any;
    next();
  }, requireAuth, requireGuildAdmin, (_req, res) => res.status(200).json({ ok: true }));

  const response = await request(app).get('/guilds/g1/x');
  globalThis.fetch = realFetch;

  assert.equal(response.status, 503, 'must fail closed, never fall through to the handler');
});

test('bot owner list is parsed the same way everywhere', () => {
  assert.deepEqual(parseOwnerIds('111,  222 ,333'), ['111', '222', '333']);
  assert.deepEqual(parseOwnerIds(undefined), []);
  assert.deepEqual(parseOwnerIds(''), []);

  // The bug this replaced: the bot compared the raw string, so with two owners
  // configured neither of them matched.
  assert.equal(isBotOwner('222', '111,222'), true);
  assert.equal(isBotOwner('111', '111,222'), true);
  assert.equal(isBotOwner('333', '111,222'), false);
  assert.equal(isBotOwner(undefined, '111'), false);
});

test('concurrent lookups for one user share a single Discord call', async (t) => {
  t.mock.method(redis, 'get', async () => null);
  t.mock.method(redis, 'setex', async () => 'OK');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 20));
    return new Response(JSON.stringify([{ id: 'g1', name: 'G', icon: null, owner: true, permissions: '0' }]), { status: 200 });
  });

  const results = await Promise.all(Array.from({ length: 7 }, () => getUserGuilds({ id: 'burst', accessToken: 'ok' })));

  assert.equal(calls, 1);
  assert.ok(results.every(r => r[0].id === 'g1'));
});

test('a Discord rate limit is retried once after the requested wait', async (t) => {
  t.mock.method(redis, 'get', async () => null);
  t.mock.method(redis, 'setex', async () => 'OK');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) return new Response('{}', { status: 429, headers: { 'retry-after': '0.05' } });
    return new Response('[]', { status: 200 });
  });

  assert.deepEqual(await getUserGuilds({ id: 'limited', accessToken: 'ok' }), []);
  assert.equal(calls, 2);
});
