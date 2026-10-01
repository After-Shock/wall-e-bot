export const CHANNEL_NOT_VISIBLE =
  "Wall-E can't see that channel. Give Wall-E's role View Channel and Send Messages there, then try again.";

// Returns why the bot can't post in this channel, or null if it can see it in this guild.
export async function channelError(channelId: string, guildId: string): Promise<string | null> {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (res.status === 403) return CHANNEL_NOT_VISIBLE;
  if (!res.ok) return 'Invalid channel';
  return ((await res.json()) as { guild_id?: string }).guild_id === guildId ? null : 'Invalid channel';
}
