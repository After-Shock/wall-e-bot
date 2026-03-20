import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { requireAuth, requireBotOwner, requireGuildAccess } from './auth.js';

function createApp(routeMiddleware: express.RequestHandler[]) {
  const app = express();
  app.get('/guilds/:guildId/resource', ...routeMiddleware, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

test('requireBotOwner blocks authenticated non-owners', async () => {
  const app = createApp([
    (req, _res, next) => {
      req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
      req.user = { id: 'not-owner' } as any;
      next();
    },
    requireAuth,
    requireBotOwner,
  ]);

  process.env.BOT_OWNER_ID = 'owner-1';

  const response = await request(app).get('/guilds/1/resource');

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: 'Bot owner only' });
});

test('requireGuildAccess rejects unauthenticated access before any guild lookup', async () => {
  const app = createApp([
    (req, _res, next) => {
      req.isAuthenticated = (() => false) as typeof req.isAuthenticated;
      next();
    },
    requireAuth,
    requireGuildAccess,
  ]);

  const response = await request(app).get('/guilds/target-guild/resource');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Not authenticated' });
});
