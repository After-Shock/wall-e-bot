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

const __dirname = dirname(fileURLToPath(import.meta.url));

export class WallEClient extends Client {
  public commands: Collection<string, Command> = new Collection();
  public cooldowns: Collection<string, Collection<string, number>> = new Collection();
  
  // Services
  public db!: DatabaseService;
  public cache!: CacheService;
  public leveling!: LevelingService;
  public moderation!: ModerationService;
  public automod!: AutoModService;
  public scheduler!: SchedulerService;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.MessageContent,
      ],
      partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
        Partials.Reaction,
      ],
    });
  }

  async start() {
    // Initialize services
    this.db = new DatabaseService();
    await this.db.connect();
    
    this.cache = new CacheService();
    await this.cache.connect();
    
    this.leveling = new LevelingService(this);
    this.moderation = new ModerationService(this);
    this.automod = new AutoModService(this);
    this.scheduler = new SchedulerService(this);

    // Load commands and events
    await this.loadCommands();
    await this.loadEvents();

    // Login
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error('DISCORD_TOKEN is not set');
    }

    await this.login(token);
    logger.info(`Logged in as ${this.user?.tag}`);
  }

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
        
        if ('data' in command && 'execute' in command) {
          this.commands.set(command.data.name, command);
          logger.info(`Loaded command: ${command.data.name}`);
        }
      }
    }
  }

  private async loadEvents() {
    const eventsPath = join(__dirname, '..', 'events');
    const eventFiles = readdirSync(eventsPath).filter(file => 
      file.endsWith('.js') || file.endsWith('.ts')
    );

    for (const file of eventFiles) {
      const filePath = join(eventsPath, file);
      const { default: event } = await import(filePath);
      
      if (event.once) {
        this.once(event.name, (...args) => event.execute(this, ...args));
      } else {
        this.on(event.name, (...args) => event.execute(this, ...args));
      }
      
      logger.info(`Loaded event: ${event.name}`);
    }
  }

  async deployCommands() {
    const commands = this.commands.map(cmd => cmd.data.toJSON());
    
    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
    
    logger.info(`Deploying ${commands.length} application commands...`);
    
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
      { body: commands }
    );
    
    logger.info('Successfully deployed application commands');
  }
}
