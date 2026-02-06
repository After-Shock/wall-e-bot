import 'dotenv/config';
import { WallEClient } from './structures/Client.js';
import { logger } from './utils/logger.js';

const client = new WallEClient();

process.on('unhandledRejection', (error: Error) => {
  logger.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

async function main() {
  try {
    await client.start();
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

main();
