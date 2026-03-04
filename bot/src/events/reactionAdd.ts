import { Events, MessageReaction, User, PartialMessageReaction, PartialUser } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageReactionAdd,
  once: false,
  async execute(
    client: WallEClient,
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) {
    if (user.bot) return;
    if (!reaction.message.guild) return;

    // Fetch partials
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    if (reaction.message.partial) {
      try { await reaction.message.fetch(); } catch { return; }
    }

    await handleReactionCommand(client, reaction as MessageReaction, user as User, 'add');
  },
};

async function handleReactionCommand(
  client: WallEClient,
  reaction: MessageReaction,
  user: User,
  type: 'add' | 'remove',
) {
  const guild = reaction.message.guild!;

  // Whitelist check
  const wl = await client.db.pool.query(
    'SELECT status, permanent, expires_at FROM guild_whitelist WHERE guild_id = $1',
    [guild.id],
  ).catch(() => null);
  const wlRow = wl?.rows[0];
  const expired = !wlRow?.permanent && wlRow?.expires_at && new Date(wlRow.expires_at) < new Date();
  if (wlRow?.status !== 'approved' || expired) return;

  const emojiIdentifier = reaction.emoji.id ?? reaction.emoji.name ?? '';

  const result = await client.db.pool.query(
    `SELECT id, responses, embed_response, embed_color, reaction_type
     FROM custom_commands
     WHERE guild_id = $1
       AND enabled = TRUE
       AND trigger_type = 'reaction'
       AND reaction_message_id = $2
       AND (reaction_emoji = $3 OR reaction_emoji IS NULL)
       AND (reaction_type = $4 OR reaction_type = 'both')`,
    [guild.id, reaction.message.id, emojiIdentifier, type],
  );

  for (const cmd of result.rows) {
    try {
      const channel = reaction.message.channel;
      if (!channel.isTextBased() || !('send' in channel)) continue;

      const responses = cmd.responses as string[];
      const raw = responses[Math.floor(Math.random() * responses.length)];

      const member = await guild.members.fetch(user.id).catch(() => null);
      const rendered = client.template.render(raw, {
        user: `<@${user.id}>`,
        username: member?.displayName ?? user.username,
        userId: user.id,
        server: guild.name,
        memberCount: guild.memberCount,
        channel: 'name' in channel ? `#${(channel as { name: string }).name}` : '',
        channelId: channel.id,
        args: [],
      });

      if (cmd.embed_response) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setDescription(rendered)
          .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
        await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
      } else {
        await (channel as import('discord.js').TextChannel).send(rendered);
      }

      client.db.pool.query(
        'UPDATE custom_commands SET uses = uses + 1 WHERE id = $1',
        [cmd.id],
      ).catch(() => {});
    } catch (error) {
      logger.error('Error firing reaction command:', error);
    }
  }
}
