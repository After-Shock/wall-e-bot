/**
 * Health Check Endpoints
 * 
 * Provides health status for Docker health checks, load balancers,
 * and monitoring systems.
 * 
 * Endpoints:
 * - GET /health - Basic health check (always returns 200 if server is running)
 * - GET /health/ready - Readiness check (verifies database and Redis)
 * - GET /health/live - Liveness check (basic process health)
 * 
 * @module routes/health
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';

const router = Router();

// Database pool (will be injected)
let dbPool: Pool | null = null;
let redisClient: Redis | null = null;

/**
 * Initialize health check with database and Redis connections.
 */
export function initHealthCheck(pool: Pool, redis: Redis): void {
  dbPool = pool;
  redisClient = redis;
}

/**
 * GET /health
 * 
 * Basic health check - returns 200 if the server is running.
 * Used by Docker HEALTHCHECK and basic uptime monitors.
 */
router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /health/live
 * 
 * Liveness probe - indicates the process is running.
 * Kubernetes uses this to know when to restart the container.
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    pid: process.pid,
    memory: process.memoryUsage(),
  });
});

/**
 * GET /health/ready
 * 
 * Readiness probe - indicates the service is ready to accept traffic.
 * Verifies database and Redis connections are working.
 */
router.get('/ready', async (req: Request, res: Response) => {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};
  let isReady = true;

  // Check PostgreSQL
  if (dbPool) {
    const start = Date.now();
    try {
      await dbPool.query('SELECT 1');
      checks.database = {
        status: 'ok',
        latency: Date.now() - start,
      };
    } catch (error) {
      isReady = false;
      checks.database = {
        status: 'error',
        error: (error as Error).message,
      };
    }
  } else {
    checks.database = { status: 'not_configured' };
  }

  // Check Redis
  if (redisClient) {
    const start = Date.now();
    try {
      await redisClient.ping();
      checks.redis = {
        status: 'ok',
        latency: Date.now() - start,
      };
    } catch (error) {
      isReady = false;
      checks.redis = {
        status: 'error',
        error: (error as Error).message,
      };
    }
  } else {
    checks.redis = { status: 'not_configured' };
  }

  const statusCode = isReady ? 200 : 503;
  res.status(statusCode).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * GET /health/detailed
 * 
 * Detailed health information for debugging.
 * Should be protected in production.
 */
router.get('/detailed', async (req: Request, res: Response) => {
  const memUsage = process.memoryUsage();
  
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    memory: {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    },
    environment: process.env.NODE_ENV || 'development',
  });
});

export default router;
