import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { rateLimit, RateLimitPresets } from './rateLimit.js';
import { redis } from '../redis.js';

// Redis is not running in tests, so every call takes the error path — which is
// exactly the behaviour under test.
after(() => { redis.disconnect(); });

function appWith(mw: express.RequestHandler) {
  const app = express();
  app.get('/x', mw, (_req, res) => { res.status(200).json({ ok: true }); });
  return app;
}

test('auth and sensitive presets fail closed when Redis is unavailable', async () => {
  assert.equal(RateLimitPresets.auth.failClosed, true);
  assert.equal(RateLimitPresets.sensitive.failClosed, true);

  const response = await request(appWith(rateLimit(RateLimitPresets.auth))).get('/x');

  assert.equal(response.status, 503, 'losing Redis must not remove the auth limit');
});

test('non-security presets still fail open when Redis is unavailable', async () => {
  const response = await request(appWith(rateLimit(RateLimitPresets.standard))).get('/x');

  assert.equal(response.status, 200, 'a cache outage should not take down ordinary endpoints');
});
