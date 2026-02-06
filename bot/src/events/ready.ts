import { Events, ActivityType } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.ClientReady,
  once: true,
  execute(client: WallEClient) {
    logger.info(`Ready! Logged in as ${client.user?.tag}`);
    logger.info(`Serving ${client.guilds.cache.size} guilds`);

    // Set presence
    client.user?.setPresence({
      activities: [
        {
          name: `/help | ${client.guilds.cache.size} servers`,
          type: ActivityType.Watching,
        },
      ],
      status: 'online',
    });

    // Update presence periodically
    setInterval(() => {
      client.user?.setPresence({
        activities: [
          {
            name: `/help | ${client.guilds.cache.size} servers`,
            type: ActivityType.Watching,
          },
        ],
        status: 'online',
      });
    }, 5 * 60 * 1000); // Every 5 minutes
  },
};
