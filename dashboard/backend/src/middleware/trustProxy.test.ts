import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

/**
 * `trust proxy` decides what req.ip is, and the rate limiter keys on req.ip for
 * anonymous callers. Get the hop count wrong and every user shares one bucket,
 * which locks out login for everyone. Pin the real chain.
 *
 * Measured in production from nginx's access log: Traefik terminates TLS and
 * appends the client to X-Forwarded-For, nginx appends Traefik, and the socket
 * peer is nginx. So the app sees `XFF: <client>, <traefik>` from nginx.
 */
const TRAEFIK = '172.18.0.7';
const CLIENT = '203.0.113.9';

function appWithTrust(trust: number | boolean) {
  const app = express();
  app.set('trust proxy', trust);
  app.get('/ip', (req, res) => { res.json({ ip: req.ip }); });
  return app;
}

test('trust proxy 2 resolves the real client through Traefik + nginx', async () => {
  const res = await request(appWithTrust(2))
    .get('/ip')
    .set('X-Forwarded-For', `${CLIENT}, ${TRAEFIK}`);

  assert.equal(res.body.ip, CLIENT, 'req.ip must be the client, not a proxy');
});

test('trust proxy 1 collapses every caller onto Traefik (the bug)', async () => {
  const res = await request(appWithTrust(1))
    .get('/ip')
    .set('X-Forwarded-For', `${CLIENT}, ${TRAEFIK}`);

  assert.equal(res.body.ip, TRAEFIK,
    'documents why 1 was wrong: all users would share one rate-limit bucket');
});

test('a spoofed X-Forwarded-For entry cannot become req.ip', async () => {
  // A client sending its own XFF has that value pushed left as each proxy
  // appends the address it actually saw, and hops are counted from the right.
  const res = await request(appWithTrust(2))
    .get('/ip')
    .set('X-Forwarded-For', `1.2.3.4, ${CLIENT}, ${TRAEFIK}`);

  assert.equal(res.body.ip, CLIENT, 'spoofed left-most entry must be ignored');
  assert.notEqual(res.body.ip, '1.2.3.4');
});
