export const CHANNEL_NOT_VISIBLE =
  "Wall-E can't see that channel. Give Wall-E's role View Channel and Send Messages there, then try again.";
export const CHANNEL_MISSING_PERMISSIONS =
  "Wall-E is missing permissions in that channel. Give Wall-E's role View Channel, Send Messages and Embed Links there, then try again.";
export const CATEGORY_NOT_VISIBLE =
  "Wall-E can't see that category. Give Wall-E's role View Channel and Manage Channels on it, then try again.";
export const NOT_A_CATEGORY =
  'That ID is not a category. In Discord, right-click the category name → Copy Category ID.';

const fetchChannel = (id: string) => fetch(`https://discord.com/api/v10/channels/${id}`, {
  headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
});

// Returns why the bot can't post in this channel, or null if it can see it in this guild.
export async function channelError(channelId: string, guildId: string): Promise<string | null> {
  const res = await fetchChannel(channelId);
  if (res.status === 403) return CHANNEL_NOT_VISIBLE;
  if (!res.ok) return 'Invalid channel';
  return ((await res.json()) as { guild_id?: string }).guild_id === guildId ? null : 'Invalid channel';
}

// Returns why tickets can't be created under this category, or null if it is a visible category in this guild.
export async function categoryError(categoryId: string, guildId: string): Promise<string | null> {
  if (!/^\d{17,20}$/.test(categoryId)) return NOT_A_CATEGORY;
  const res = await fetchChannel(categoryId);
  if (res.status === 403) return CATEGORY_NOT_VISIBLE;
  if (!res.ok) return 'Category not found in this server';
  const channel = await res.json() as { guild_id?: string; type?: number };
  if (channel.guild_id !== guildId) return 'Category not found in this server';
  return channel.type === 4 ? null : NOT_A_CATEGORY;
}

/** Discord's Missing Access / Missing Permissions codes mean a channel permission problem, not a bug. */
export function isChannelPermissionError(body: string): boolean {
  try {
    return [50001, 50013].includes((JSON.parse(body) as { code?: number }).code ?? 0);
  } catch {
    return false;
  }
}
