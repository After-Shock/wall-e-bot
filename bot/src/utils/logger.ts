import winston from 'winston';
import { resolveLogDirectory } from './logDirectory.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;
const logDirectory = resolveLogDirectory();

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat,
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), logFormat),
    }),
    new winston.transports.File({
      filename: `${logDirectory}/error.log`,
      level: 'error',
    }),
    new winston.transports.File({
      filename: `${logDirectory}/combined.log`,
    }),
  ],
});
