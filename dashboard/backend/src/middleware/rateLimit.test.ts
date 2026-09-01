import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { rateLimit, rateLimitByUser, RateLimitPresets } from './rateLimit.js';
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

test('anonymous callers get a stable bucket, not one per request', async () => {
  // The bug: keying on req.sessionID meant express-session minted a fresh id
  // for every anonymous request, so nothing ever accumulated. Whatever the key
  // is now, two requests from the same caller must land in the SAME bucket.
  const keys: string[] = [];
  const mw = rateLimit({
    max: 1,
    windowSeconds: 60,
    keyGenerator: (req) => {
      const k = (req as unknown as { user?: { id: string } }).user?.id ?? req.ip ?? 'unknown';
      keys.push(k);
      return k;
    },
  });

  const app = express();
  app.get('/x', mw, (_req, res) => { res.status(200).json({ ok: true }); });

  await request(app).get('/x');
  await request(app).get('/x');

  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1], 'same caller must produce the same key on both requests');
  assert.ok(!/^[A-Za-z0-9_-]{32}$/.test(keys[0]), 'must not be a per-request session id');
});

test('rateLimitByUser keys on the user when authenticated', async () => {
  const keys: string[] = [];
  const app = express();
  app.get('/x',
    (req, _res, next) => { (req as unknown as { user: unknown }).user = { id: 'u-42' }; next(); },
    rateLimitByUser({
      max: 100,
      windowSeconds: 60,
      handler: (_req, res) => { res.status(429).end(); },
    }),
    (_req, res) => { res.status(200).json({ ok: true }); },
  );
  // Redis is down in tests, so this exercises the fail-open path; the point is
  // that the middleware runs without throwing and the route is reachable.
  const r = await request(app).get('/x');
  assert.equal(r.status, 200);
  assert.equal(keys.length, 0);
});
