// Returns an error message if the bot could not hand out one of these roles.
// Without this the message posts fine and every button silently fails on click.
export async function unassignableRoleError(guildId: string, roleIds: string[]): Promise<string | null> {
  const [rolesRes, meRes] = await Promise.all([
    fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } }),
    fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${process.env.DISCORD_CLIENT_ID}`, { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } }),
  ]);
  if (!rolesRes.ok || !meRes.ok) return 'Could not verify role permissions with Discord';

  const all = await rolesRes.json() as { id: string; name: string; position: number; managed: boolean }[];
  const me = await meRes.json() as { roles: string[] };
  const byId = new Map(all.map(r => [r.id, r]));
  const botHighest = Math.max(0, ...me.roles.map(id => byId.get(id)?.position ?? 0));

  for (const id of roleIds) {
    const role = byId.get(id);
    if (!role) return 'One of the selected roles no longer exists';
    if (role.managed) return `@${role.name} is managed by an integration and cannot be assigned`;
    if (role.position >= botHighest) {
      return `@${role.name} is above Wall-E's highest role. Drag Wall-E's role above it in Server Settings → Roles.`;
    }
  }
  return null;
}
