/**
 * Wall-E Bot - Main Client
 * 
 * A feature-rich Discord bot built with Discord.js v14.
 * This file contains the main client class that orchestrates all bot functionality.
 * 
 * @module structures/Client
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  REST,
  Routes,
} from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Command } from './Command.js';
import { DatabaseService } from '../services/DatabaseService.js';
import { CacheService } from '../services/CacheService.js';
import { LevelingService } from '../services/LevelingService.js';
import { ModerationService } from '../services/ModerationService.js';
import { AutoModService } from '../services/AutoModService.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { logger } from '../utils/logger.js';

// ES Module compatibility - get __dirname equivalent
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Extended Discord.js Client with custom services and command handling.
 * 
 * This client integrates:
 * - PostgreSQL database for persistent storage
 * - Redis cache for rate limiting and sessions
 * - Leveling system for XP and ranks
 * - Moderation tools (bans, kicks, warnings)
 * - Auto-moderation (spam, word filters)
 * - Scheduled tasks (timed messages, temp bans)
 * 
 * @extends {Client}
 */
export class WallEClient extends Client {
  /** Collection of all registered slash commands */
  public commands: Collection<string, Command> = new Collection();
  
  /** Cooldown tracking: Map<commandName, Map<userId, timestamp>> */
  public cooldowns: Collection<string, Collection<string, number>> = new Collection();
  
  // ============================================
  // Services - initialized in start()
  // ============================================
  
  /** PostgreSQL database connection and query methods */
  public db!: DatabaseService;
  
  /** Redis cache for sessions, rate limits, and temporary data */
  public cache!: CacheService;
  
  /** XP/leveling system management */
  public leveling!: LevelingService;
  
  /** Moderation actions (ban, kick, warn, timeout) */
  public moderation!: ModerationService;
  
  /** Automatic moderation (spam detection, word filters) */
  public automod!: AutoModService;
  
  /** Background task scheduler for timed messages and temp unbans */
  public scheduler!: SchedulerService;

  /**
   * Initialize the Discord client with required intents and partials.
   * 
   * Intents determine what events the bot receives from Discord.
   * Partials allow handling of uncached objects (e.g., reactions on old messages).
   */
  constructor() {
    super({
      intents: [
        // Server-related events
        GatewayIntentBits.Guilds,                    // Guild create/update/delete
        GatewayIntentBits.GuildMembers,              // Member join/leave/update (privileged)
        GatewayIntentBits.GuildModeration,           // Ban/unban events
        GatewayIntentBits.GuildEmojisAndStickers,    // Emoji updates
        GatewayIntentBits.GuildIntegrations,         // Integration updates
        GatewayIntentBits.GuildWebhooks,             // Webhook updates
        GatewayIntentBits.GuildInvites,              // Invite create/delete
        GatewayIntentBits.GuildVoiceStates,          // Voice channel events
        GatewayIntentBits.GuildPresences,            // Presence updates (privileged)
        
        // Message-related events
        GatewayIntentBits.GuildMessages,             // Messages in guilds
        GatewayIntentBits.GuildMessageReactions,     // Reactions in guilds
        GatewayIntentBits.GuildMessageTyping,        // Typing indicators
        GatewayIntentBits.DirectMessages,            // DM messages
        GatewayIntentBits.DirectMessageReactions,    // DM reactions
        GatewayIntentBits.MessageContent,            // Message content (privileged)
      ],
      partials: [
        // Enable handling of uncached/partial objects
        Partials.Channel,      // DM channels
        Partials.Message,      // Old messages (for reaction roles)
        Partials.User,         // Uncached users
        Partials.GuildMember,  // Uncached members
        Partials.Reaction,     // Reactions on old messages
      ],
    });
  }

  /**
   * Initialize all services and start the bot.
   * 
   * Startup sequence:
   * 1. Connect to PostgreSQL database
   * 2. Connect to Redis cache
   * 3. Initialize service modules
   * 4. Load slash commands from /commands
   * 5. Load event handlers from /events
   * 6. Login to Discord
   * 
   * @throws {Error} If DISCORD_TOKEN environment variable is not set
   */
  async start() {
    // Step 1-2: Connect to external services
    this.db = new DatabaseService();
    await this.db.connect();
    
    this.cache = new CacheService();
    await this.cache.connect();
    
    // Step 3: Initialize internal services (order matters - some depend on db/cache)
    this.leveling = new LevelingService(this);
    this.moderation = new ModerationService(this);
    this.automod = new AutoModService(this);
    this.scheduler = new SchedulerService(this);

    // Step 4-5: Load commands and events
    await this.loadCommands();
    await this.loadEvents();

    // Step 6: Authenticate with Discord
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error('DISCORD_TOKEN is not set in environment variables');
    }

    await this.login(token);
    logger.info(`Logged in as ${this.user?.tag}`);
  }

  /**
   * Dynamically load all slash commands from the commands directory.
   * 
   * Commands are organized in subdirectories by category:
   *   /commands/moderation/ban.ts
   *   /commands/admin/setup.ts
   *   /commands/utility/ping.ts
   * 
   * Each command file must export a default object with:
   *   - data: SlashCommandBuilder instance
   *   - execute: async function(client, interaction)
   */
  private async loadCommands() {
    const commandsPath = join(__dirname, '..', 'commands');
    const commandFolders = readdirSync(commandsPath);

    for (const folder of commandFolders) {
      const folderPath = join(commandsPath, folder);
      const commandFiles = readdirSync(folderPath).filter(file => 
        file.endsWith('.js') || file.endsWith('.ts')
      );

      for (const file of commandFiles) {
        const filePath = join(folderPath, file);
        const { default: command } = await import(filePath) as { default: Command };
        
        // Validate command structure before registering
        if ('data' in command && 'execute' in command) {
          this.commands.set(command.data.name, command);
          logger.info(`Loaded command: ${command.data.name}`);
        }
      }
    }
  }

  /**
   * Dynamically load all event handlers from the events directory.
   * 
   * Event files must export a default object with:
   *   - name: Discord.js event name (e.g., 'messageCreate', 'ready')
   *   - once: boolean - if true, listener fires only once
   *   - execute: async function(client, ...eventArgs)
   */
  private async loadEvents() {
    const eventsPath = join(__dirname, '..', 'events');
    const eventFiles = readdirSync(eventsPath).filter(file => 
      file.endsWith('.js') || file.endsWith('.ts')
    );

    for (const file of eventFiles) {
      const filePath = join(eventsPath, file);
      const { default: event } = await import(filePath);
      
      // Register as one-time or persistent listener
      if (event.once) {
        this.once(event.name, (...args) => event.execute(this, ...args));
      } else {
        this.on(event.name, (...args) => event.execute(this, ...args));
      }
      
      logger.info(`Loaded event: ${event.name}`);
    }
  }

  /**
   * Deploy slash commands to Discord's API.
   * 
   * This registers commands globally (available in all guilds).
   * Changes may take up to 1 hour to propagate globally.
   * For instant updates during development, use guild-specific deployment.
   * 
   * @requires DISCORD_TOKEN - Bot token
   * @requires DISCORD_CLIENT_ID - Application client ID
   */
  async deployCommands() {
    const commands = this.commands.map(cmd => cmd.data.toJSON());
    
    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
    
    logger.info(`Deploying ${commands.length} application commands...`);
    
    // PUT replaces all commands (safer than PATCH for consistency)
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
      { body: commands }
    );
    
    logger.info('Successfully deployed application commands');
  }
}
