import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { logger } from './utils/logger.js';
import { authRouter } from './routes/auth.js';
import { guildsRouter } from './routes/guilds.js';
import { usersRouter } from './routes/users.js';
import { botRouter } from './routes/bot.js';
import { db } from './db/index.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.DASHBOARD_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'super-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
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
    // Upsert user in database
    await db.query(
      `INSERT INTO users (discord_id, username, discriminator, avatar, email, access_token, refresh_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (discord_id) DO UPDATE SET
         username = $2, discriminator = $3, avatar = $4, email = $5, 
         access_token = $6, refresh_token = $7, updated_at = NOW()`,
      [profile.id, profile.username, profile.discriminator, profile.avatar, profile.email, accessToken, refreshToken]
    );

    return done(null, { ...profile, accessToken, refreshToken });
  } catch (error) {
    return done(error as Error);
  }
}));

passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

// Routes
app.use('/auth', authRouter);
app.use('/api/guilds', guildsRouter);
app.use('/api/users', usersRouter);
app.use('/api/bot', botRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(`Dashboard API running on port ${PORT}`);
});
