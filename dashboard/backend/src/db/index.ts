import pg from 'pg';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Unbounded before: pg's default of 10 connections with no timeouts meant one
  // slow query could hold a connection indefinitely and starve authentication.
  // The bot's pool already carried these; the API's did not.
  max: Number(process.env.PG_POOL_MAX ?? 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Server-side ceiling: a runaway query is killed by Postgres rather than
  // occupying a pool slot until someone notices.
  statement_timeout: 10_000,
});

db.on('connect', () => {
  logger.info('Connected to PostgreSQL');
});

db.on('error', (err) => {
  logger.error('PostgreSQL error:', err);
});
