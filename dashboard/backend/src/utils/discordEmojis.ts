export interface GuildEmoji {
  id: string;
  name: string;
  animated: boolean;
}

/** The guild's usable custom emoji. Empty on failure: emoji are cosmetic, never worth failing a send over. */
export async function fetchGuildEmojis(guildId: string): Promise<GuildEmoji[]> {
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/emojis`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
    });
    if (!res.ok) return [];
    const emojis = await res.json() as { id: string; name: string; animated?: boolean; available?: boolean }[];
    return emojis.filter(e => e.available !== false).map(e => ({ id: e.id, name: e.name, animated: !!e.animated }));
  } catch {
    return [];
  }
}

/**
 * Turn :name: into <:name:id> for this server's custom emoji. Discord only converts
 * shortcodes typed in its own client; text sent by a bot shows them literally.
 * Existing <:name:id> codes and unknown names are left as they are.
 */
export function resolveCustomEmojis(text: string, emojis: GuildEmoji[]): string {
  if (!text || emojis.length === 0) return text;
  const byName = new Map(emojis.map(e => [e.name, e]));
  return text.replace(/(?<!<a?):([\w~]{2,32}):(?!\d)/g, (match, name: string) => {
    const emoji = byName.get(name);
    return emoji ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>` : match;
  });
}
