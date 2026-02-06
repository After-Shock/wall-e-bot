import 'dotenv/config';
import { WallEClient } from './structures/Client.js';
import { logger } from './utils/logger.js';

async function deployCommands() {
  const client = new WallEClient();
  
  // Load commands without starting the bot
  const { readdirSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const commandsPath = join(__dirname, 'commands');
  const commandFolders = readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = join(commandsPath, folder);
    const commandFiles = readdirSync(folderPath).filter(file => 
      file.endsWith('.js') || file.endsWith('.ts')
    );

    for (const file of commandFiles) {
      const filePath = join(folderPath, file);
      const { default: command } = await import(filePath);
      
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        logger.info(`Loaded command: ${command.data.name}`);
      }
    }
  }

  await client.deployCommands();
  process.exit(0);
}

deployCommands().catch(error => {
  logger.error('Failed to deploy commands:', error);
  process.exit(1);
});
