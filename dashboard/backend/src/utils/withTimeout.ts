/**
 * Bound a promise that talks to Redis.
 *
 * ioredis queues commands while it is disconnected rather than rejecting them,
 * so a Redis outage turns an await into a hang. Code that has a considered
 * fallback — serve from the database, fail the request open, fail it closed —
 * never reaches that fallback if the call never settles. The session store
 * genuinely wants the offline queue, so the client keeps it and callers that
 * must not block bound their own calls instead.
 *
 * @module utils/withTimeout
 */

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new TimeoutError(ms)), ms).unref()),
  ]);
}
