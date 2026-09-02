import 'dotenv/config';
import { initSentry, Sentry } from './utils/sentry.js';
initSentry();
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import connectRedis from 'connect-redis';
import { redis } from './redis.js';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { logger } from './utils/logger.js';
import { authRouter } from './routes/auth.js';
import { guildsRouter } from './routes/guilds.js';
import { usersRouter } from './routes/users.js';
import { botRouter } from './routes/bot.js';
import { adminRouter } from './routes/admin.js';
import { customCommandsRouter } from './routes/customCommands.js';
import { commandGroupsRouter } from './routes/commandGroups.js';
import { dashboardRolesRouter } from './routes/dashboardRoles.js';
import { autoDeleteRouter } from './routes/autoDelete.js';
import healthRouter, { initHealthCheck } from './routes/health.js';
import statusRouter, { initStatus } from './routes/status.js';
import { db } from './db/index.js';
import { assertValidSessionSecret } from './utils/security.js';
import { encryptToken } from './utils/crypto.js';

const app = express();
const PORT = process.env.PORT || 3001;
const sessionSecret = assertValidSessionSecret(process.env.SESSION_SECRET);

// Two proxies sit in front of this app, not one: Traefik terminates TLS and
// appends the client to X-Forwarded-For, then the frontend nginx appends
// Traefik. Measured from nginx's access log — $remote_addr is Traefik's
// container IP while XFF already carries the real client — so the backend
// receives `<client>, <traefik>` over a socket from nginx.
//
// With `1`, Express trusted only nginx and resolved req.ip to Traefik's IP for
// every request. That is invisible until something keys on req.ip, at which
// point every user shares one bucket. Counting hops from the right is also what
// makes this spoof-resistant: a client-supplied XFF entry lands to the left of
// the addresses the proxies append, so it can never become req.ip.
app.set('trust proxy', 2);

// Redis session store
const RedisStore = connectRedis(session);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.DASHBOARD_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Session
app.use(session({
  store: new RedisStore({ client: redis }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'lax' : false,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Discord OAuth2 Strategy
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  callbackURL: `${process.env.API_URL || 'http://localhost:3001'}/auth/callback`,
  scope: ['identify', 'guilds', 'email'],
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const encryptedAccess = encryptToken(accessToken);
    const encryptedRefresh = refreshToken ? encryptToken(refreshToken) : null;

    await db.query(
      `INSERT INTO users (discord_id, username, discriminator, avatar, email, access_token, refresh_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (discord_id) DO UPDATE SET
         username = $2, discriminator = $3, avatar = $4, email = $5,
         access_token = $6, refresh_token = $7, updated_at = NOW()`,
      [profile.id, profile.username, profile.discriminator, profile.avatar, profile.email,
       encryptedAccess, encryptedRefresh],
    );

    // Pass plaintext tokens in session (encrypted only at rest in DB)
    return done(null, { ...profile, accessToken, refreshToken });
  } catch (error) {
    return done(error as Error);
  }
}));

// Store identity only. The full Discord profile used to go into the session,
// guilds included — a ~100 KB payload rewritten on every request, and an authz
// snapshot frozen for the 7-day session lifetime. Guilds are now resolved live
// via utils/userGuilds.ts with a 5-minute cache.
passport.serializeUser((user: any, done) => {
  done(null, {
    id: user.id,
    username: user.username,
    discriminator: user.discriminator,
    avatar: user.avatar,
    email: user.email,
    accessToken: user.accessToken,
    refreshToken: user.refreshToken,
  });
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

// Routes
app.use('/auth', authRouter);
app.use('/api/guilds', guildsRouter);
app.use('/api/users', usersRouter);
app.use('/api/bot', botRouter);
app.use('/api/admin', adminRouter);
app.use('/api/guilds/:guildId/custom-commands', customCommandsRouter);
app.use('/api/guilds/:guildId/command-groups', commandGroupsRouter);
app.use('/api/guilds/:guildId/dashboard-roles', dashboardRolesRouter);
app.use('/api/guilds/:guildId/auto-delete', autoDeleteRouter);

// Health checks.
//
// The inline handler here returned {status:'ok'} unconditionally — Postgres and
// Redis could both be down and it stayed green. routes/health.ts implemented
// real probes all along and was imported by nothing.
//   /health        liveness — the process is up
//   /health/ready  readiness — Postgres and Redis actually answer (503 if not)
initHealthCheck(db, redis);
initStatus(db, redis);
app.use('/health', healthRouter);
// /health/status — operational judgement for uptime-kuma; see routes/status.ts
app.use('/health', statusRouter);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  Sentry.captureException(err);
  logger.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  logger.info(`Dashboard API running on port ${PORT}`);
});

// Graceful shutdown. Without this every deploy killed in-flight requests and
// abandoned pool connections; the bot had a clean shutdown path, the API had
// none.
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down...`);

  const force = setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, 15_000);
  force.unref();

  try {
    // Stop accepting connections, then let in-flight requests finish.
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.end();
    await redis.quit();
    clearTimeout(force);
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
