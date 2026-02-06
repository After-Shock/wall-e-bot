/**
 * Wall-E Bot Entry Point
 * 
 * Initializes the Discord client with graceful shutdown handling.
 * For production deployments with >2500 guilds, use shard.ts instead.
 * 
 * @module index
 */

import 'dotenv/config';
import { WallEClient } from './structures/Client.js';
import { logger } from './utils/logger.js';

// Track if we're already shutting down to prevent double-shutdown
let isShuttingDown = false;

const client = new WallEClient();

// =============================================================================
// Error Handling
// =============================================================================

process.on('unhandledRejection', (error: Error) => {
  logger.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception:', error);
  // Give time for logs to flush, then exit
  setTimeout(() => process.exit(1), 1000);
});

// =============================================================================
// Graceful Shutdown
// =============================================================================

/**
 * Gracefully shutdown the bot.
 * 
 * Order of operations:
 * 1. Stop accepting new commands (set status)
 * 2. Stop scheduler to prevent new tasks from starting
 * 3. Wait for in-flight operations (brief delay)
 * 4. Disconnect from Discord
 * 5. Close Redis connection
 * 6. Close database connection pool
 * 7. Exit process
 */
async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress...');
    return;
  }
  
  isShuttingDown = true;
  logger.info(`\n📴 Received ${signal}, starting graceful shutdown...`);

  const shutdownTimeout = setTimeout(() => {
    logger.error('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // Call the client's shutdown method
    await client.shutdown();
    
    clearTimeout(shutdownTimeout);
    logger.info('👋 Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    clearTimeout(shutdownTimeout);
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // Docker/Kubernetes stop

// =============================================================================
// Main Entry Point
// =============================================================================

async function main() {
  try {
    logger.info('🤖 Starting Wall-E Bot...');
    await client.start();
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

main();
