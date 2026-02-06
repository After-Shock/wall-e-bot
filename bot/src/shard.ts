/**
 * Shard Manager
 * 
 * Entry point for production deployments that need to scale beyond 2,500 guilds.
 * Discord enforces a limit of 2,500 guilds per WebSocket connection (shard).
 * 
 * The ShardingManager spawns multiple bot processes, each handling a subset of guilds.
 * Discord automatically routes events to the correct shard based on guild ID.
 * 
 * Usage:
 *   npm run start:shard   (production)
 *   node dist/shard.js    (direct)
 * 
 * For small bots (<2,500 guilds), use the regular entry point:
 *   npm start
 *   node dist/index.js
 * 
 * @module shard
 */

import { ShardingManager } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// Validate required environment variables
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is required');
  process.exit(1);
}

/**
 * Create the shard manager.
 * 
 * Options:
 * - totalShards: 'auto' lets Discord calculate based on guild count
 * - respawn: Automatically restart crashed shards
 * - mode: 'process' spawns separate Node processes (recommended for production)
 */
const manager = new ShardingManager(join(__dirname, 'index.js'), {
  token: process.env.DISCORD_TOKEN,
  totalShards: 'auto', // Discord recommends ~1000 guilds per shard
  respawn: true,
  mode: 'process',
});

// =============================================================================
// Shard Event Handlers
// =============================================================================

/**
 * Fired when a new shard is created.
 */
manager.on('shardCreate', (shard) => {
  console.log(`🚀 Shard ${shard.id} launched`);

  // Forward shard-specific events
  shard.on('ready', () => {
    console.log(`✅ Shard ${shard.id} ready, serving ${shard.id === 0 ? 'primary' : 'secondary'} guilds`);
  });

  shard.on('disconnect', () => {
    console.warn(`⚠️ Shard ${shard.id} disconnected`);
  });

  shard.on('reconnecting', () => {
    console.log(`🔄 Shard ${shard.id} reconnecting...`);
  });

  shard.on('death', (childProcess) => {
    const exitCode = 'exitCode' in childProcess ? childProcess.exitCode : 'unknown';
    console.error(`💀 Shard ${shard.id} died (exit code: ${exitCode})`);
  });

  shard.on('error', (error) => {
    console.error(`❌ Shard ${shard.id} error:`, error);
  });
});

// =============================================================================
// Cross-Shard Communication Utilities
// =============================================================================

/**
 * Broadcast a message to all shards.
 * Useful for cache invalidation, config updates, etc.
 */
export async function broadcastToShards(message: unknown): Promise<void> {
  await manager.broadcastEval((client, context) => {
    client.emit('shardMessage' as any, context.message);
  }, { context: { message } });
}

/**
 * Get aggregated stats from all shards.
 */
export async function getShardStats(): Promise<{
  totalGuilds: number;
  totalUsers: number;
  shards: Array<{ id: number; guilds: number; ping: number }>;
}> {
  const results = await manager.broadcastEval((client) => ({
    id: client.shard?.ids[0] ?? 0,
    guilds: client.guilds.cache.size,
    users: client.users.cache.size,
    ping: client.ws.ping,
  }));

  return {
    totalGuilds: results.reduce((sum, r) => sum + r.guilds, 0),
    totalUsers: results.reduce((sum, r) => sum + r.users, 0),
    shards: results.map((r) => ({ id: r.id, guilds: r.guilds, ping: r.ping })),
  };
}

/**
 * Fetch a guild from any shard.
 * Returns null if guild is not found on any shard.
 */
export async function fetchGuildFromAnyShard(guildId: string): Promise<unknown | null> {
  const results = await manager.broadcastEval(
    (client, context) => {
      const guild = client.guilds.cache.get(context.guildId);
      if (!guild) return null;
      return {
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
      };
    },
    { context: { guildId } }
  );

  return results.find((r) => r !== null) ?? null;
}

// =============================================================================
// Graceful Shutdown
// =============================================================================

async function shutdown(signal: string) {
  console.log(`\n📴 Received ${signal}, shutting down shards...`);
  
  // Give shards time to finish current operations
  await Promise.all(
    Array.from(manager.shards.values()).map(async (shard) => {
      try {
        await shard.eval((client) => {
          const anyClient = client as any;
          if (typeof anyClient.shutdown === 'function') {
            return anyClient.shutdown();
          }
        });
      } catch {
        // Shard may already be dead
      }
    })
  );

  console.log('👋 All shards shut down');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// =============================================================================
// Start Sharding
// =============================================================================

console.log('🔧 Starting shard manager...');
manager.spawn({ timeout: 60000 })
  .then(() => {
    console.log(`✅ All shards spawned (${manager.shards.size} total)`);
  })
  .catch((error) => {
    console.error('❌ Failed to spawn shards:', error);
    process.exit(1);
  });
