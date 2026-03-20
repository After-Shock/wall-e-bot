import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import session from 'express-session';
import { createAuthRouter } from './auth.js';

function getSetCookieHeader(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(';');
  return value ?? '';
}

function buildApp() {
  const app = express();
  app.use((req, _res, next) => {
    req.logout = ((optionsOrCb?: unknown, maybeCb?: (err?: unknown) => void) => {
      const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb;
      cb?.();
    }) as typeof req.logout;
    next();
  });
  app.use(session({
    secret: 'a'.repeat(32),
    resave: false,
    saveUninitialized: false,
  }));

  const authenticateCalls: Array<{ strategy: string; options: Record<string, unknown> | undefined }> = [];

  const router = createAuthRouter({
    dashboardUrl: 'https://dashboard.example.com',
    generateState: () => 'fixed-state',
    authRateLimit: (_req, _res, next) => next(),
    passportInstance: {
      authenticate(strategy: string, options?: Record<string, unknown>) {
        authenticateCalls.push({ strategy, options });
        return (req: express.Request, res: express.Response, next: express.NextFunction) => {
          if (req.path === '/callback') {
            (req as express.Request & { user?: unknown }).user = {
              id: 'user-1',
              username: 'tester',
              discriminator: '0001',
              avatar: null,
              email: null,
            };
          }
          next();
        };
      },
    } as any,
  });

  app.use('/auth', router);

  return { app, authenticateCalls };
}

test('GET /auth/login stores oauth state in the session and delegates to passport', async () => {
  const { app, authenticateCalls } = buildApp();

  const response = await request(app).get('/auth/login');

  assert.equal(response.status, 404);
  assert.ok(authenticateCalls.some((call) =>
    call.strategy === 'discord' && call.options?.state === 'fixed-state'
  ));
  assert.match(getSetCookieHeader(response.headers['set-cookie']), /connect\.sid=/);
});

test('GET /auth/callback rejects mismatched oauth state', async () => {
  const { app } = buildApp();
  const agent = request.agent(app);

  await agent.get('/auth/login');
  const response = await agent.get('/auth/callback?state=wrong-state');

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: 'Invalid OAuth state' });
});

test('POST /auth/logout destroys the session and clears the cookie', async () => {
  const { app } = buildApp();
  const agent = request.agent(app);

  await agent.get('/auth/login');
  const response = await agent.post('/auth/logout');

  assert.equal(response.status, 204);
  assert.match(getSetCookieHeader(response.headers['set-cookie']), /connect\.sid=;/);
});
