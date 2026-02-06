/**
 * Environment Variable Validation
 * 
 * Uses Zod to validate all required environment variables at startup.
 * Fails fast with clear error messages if configuration is invalid.
 * 
 * @module utils/env
 */

import { z } from 'zod';

/**
 * Schema for all environment variables.
 * Each variable has validation rules and descriptions.
 */
const envSchema = z.object({
  // Discord Configuration (Required)
  DISCORD_TOKEN: z
    .string()
    .min(50, 'DISCORD_TOKEN appears to be invalid (too short)')
    .describe('Bot token from Discord Developer Portal'),
  
  DISCORD_CLIENT_ID: z
    .string()
    .regex(/^\d{17,20}$/, 'DISCORD_CLIENT_ID must be a valid Discord snowflake')
    .describe('Application client ID'),
  
  DISCORD_CLIENT_SECRET: z
    .string()
    .min(20, 'DISCORD_CLIENT_SECRET appears to be invalid')
    .optional()
    .describe('OAuth2 client secret (required for dashboard)'),
  
  // Database Configuration
  DATABASE_URL: z
    .string()
    .url()
    .startsWith('postgresql://', 'DATABASE_URL must be a PostgreSQL connection string')
    .describe('PostgreSQL connection string'),
  
  REDIS_URL: z
    .string()
    .url()
    .startsWith('redis://', 'REDIS_URL must be a Redis connection string')
    .default('redis://localhost:6379')
    .describe('Redis connection string'),
  
  // Security
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters for security')
    .optional()
    .describe('Secret for JWT token signing'),
  
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters for security')
    .optional()
    .describe('Secret for session encryption'),
  
  // Dashboard Configuration
  DASHBOARD_URL: z
    .string()
    .url()
    .optional()
    .default('http://localhost:3000')
    .describe('Frontend URL for OAuth callbacks'),
  
  API_URL: z
    .string()
    .url()
    .optional()
    .default('http://localhost:3001')
    .describe('Backend API URL'),
  
  // Bot Configuration
  BOT_OWNER_ID: z
    .string()
    .regex(/^\d{17,20}$/, 'BOT_OWNER_ID must be a valid Discord user ID')
    .optional()
    .describe('Discord user ID of the bot owner'),
  
  BOT_PREFIX: z
    .string()
    .max(10, 'BOT_PREFIX should be short')
    .optional()
    .default('!')
    .describe('Legacy prefix for text commands'),
  
  // Runtime Configuration
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .optional()
    .default('development')
    .describe('Runtime environment'),
  
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'debug'])
    .optional()
    .default('info')
    .describe('Logging verbosity'),
  
  // Saltbox Configuration (Optional)
  DOMAIN: z
    .string()
    .optional()
    .describe('Saltbox domain for Traefik'),
  
  WALL_E_DOMAIN: z
    .string()
    .optional()
    .describe('Full domain for Wall-E dashboard'),
});

/**
 * Validated environment type.
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Validate environment variables.
 * 
 * @throws {Error} If validation fails with details about what's wrong
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    const errors = result.error.errors.map((e) => {
      const path = e.path.join('.');
      return `  - ${path}: ${e.message}`;
    });
    
    console.error('\n❌ Environment validation failed:\n');
    console.error(errors.join('\n'));
    console.error('\nPlease check your .env file or environment variables.\n');
    
    process.exit(1);
  }
  
  return result.data;
}

/**
 * Validated environment variables.
 * Import this to access type-safe env vars.
 * 
 * @example
 * import { env } from './utils/env';
 * console.log(env.DISCORD_TOKEN);
 */
export const env = validateEnv();
