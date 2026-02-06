import pg from 'pg';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

db.on('connect', () => {
  logger.info('Connected to PostgreSQL');
});

db.on('error', (err) => {
  logger.error('PostgreSQL error:', err);
});
