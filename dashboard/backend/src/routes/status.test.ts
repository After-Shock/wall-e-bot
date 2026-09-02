import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import statusRouter, { initStatus } from './status.js';
import { redis as realRedis } from '../redis.js';

after(() => { realRedis.disconnect(); });

/** Minimal fakes: the point is the judgement, not the drivers. */
function fakeDb(rows: Record<string, unknown>): Pool {
  return { query: async () => ({ rows: [rows] }) } as unknown as Pool;
}
function fakeRedis(values: Record<string, string | null>): Redis {
  return {
    ping: async () => 'PONG',
    get: async (k: string) => values[k] ?? null,
  } as unknown as Redis;
}

const HEALTHY_DB = { overdue: '0', disabled_by_failure: '0', n: '0' };
const freshTick = () => ({ 'health:bot:last_tick': String(Date.now()) });

function app() {
  const a = express();
  a.use('/health', statusRouter);
  return a;
}

test('all healthy -> 200 ok', async () => {
  initStatus(fakeDb(HEALTHY_DB), fakeRedis(freshTick()));
  const r = await request(app()).get('/health/status');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
});

test('a stalled scheduler is down, not merely degraded', async () => {
  // This is the bug class that hid all session: the bot looks alive from
  // outside while its scheduler has stopped doing work.
  const stale = { 'health:bot:last_tick': String(Date.now() - 10 * 60 * 1000) };
  initStatus(fakeDb(HEALTHY_DB), fakeRedis(stale));
  const r = await request(app()).get('/health/status');
  assert.equal(r.status, 503);
  assert.equal(r.body.status, 'down');
  assert.match(r.body.checks.scheduler.detail, /last tick/);
});

test('a missing heartbeat is down, not unknown', async () => {
  initStatus(fakeDb(HEALTHY_DB), fakeRedis({}));
  const r = await request(app()).get('/health/status');
  assert.equal(r.status, 503);
  assert.match(r.body.checks.scheduler.detail, /no scheduler heartbeat/);
});

test('overdue scheduled messages are degraded but still serve 200', async () => {
  initStatus(fakeDb({ ...HEALTHY_DB, overdue: '3' }), fakeRedis(freshTick()));
  const r = await request(app()).get('/health/status');
  assert.equal(r.status, 200, 'a lagging task must not page an outage monitor');
  assert.equal(r.body.status, 'degraded');
  assert.match(r.body.checks.scheduledMessages.detail, /3 scheduled message\(s\) overdue/);
});

test('auto-disabled tasks surface — the failure that used to be silent', async () => {
  initStatus(fakeDb({ ...HEALTHY_DB, disabled_by_failure: '2' }), fakeRedis(freshTick()));
  const r = await request(app()).get('/health/status');
  assert.equal(r.body.status, 'degraded');
  assert.match(r.body.checks.scheduledMessages.detail, /auto-disabled/);
});

test('a dead database is down', async () => {
  const brokenDb = { query: async () => { throw new Error('connection refused'); } } as unknown as Pool;
  initStatus(brokenDb, fakeRedis(freshTick()));
  const r = await request(app()).get('/health/status');
  assert.equal(r.status, 503);
  assert.equal(r.body.checks.database.status, 'down');
});

test('down outranks degraded', async () => {
  initStatus(fakeDb({ ...HEALTHY_DB, overdue: '5' }), fakeRedis({}));
  const r = await request(app()).get('/health/status');
  assert.equal(r.body.status, 'down', 'worst level wins');
  assert.equal(r.status, 503);
});
