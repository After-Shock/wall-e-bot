import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { COLORS } from '@wall-e/shared';
import { getCooldownSeconds } from '../../events/interactionCreate.js';

const CATEGORY_LABELS: Record<string, string> = {
  moderation: '🛡️ Moderation',
  levels: '⭐ Levels',
  utility: '🔧 Utility',
  admin: '⚙️ Admin',
};

// ponytail: checks default + runtime permissions only, not per-role overrides set in
// Server Settings → Integrations (those need an OAuth bearer token to read).
function canUse(command: Command, interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.inGuild()) return !command.guildOnly;
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  const defaults = command.data.default_member_permissions;
  if (defaults && !perms.has(BigInt(defaults))) return false;
  return (command.permissions ?? []).every(perm => perms.has(perm));
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help with Wall-E Bot commands')
    .addStringOption(option =>
      option.setName('command')
        .setDescription('Specific command to get help for')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(client, interaction) {
    const commandName = interaction.options.getString('command');

    if (commandName) {
      const command = client.commands.get(commandName.replace(/^\//, ''));

      if (!command) {
        await interaction.reply({
          content: `Command \`${commandName}\` not found.`,
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`📖 Command: /${command.data.name}`)
        .setDescription(command.data.description)
        .addFields(
          { name: 'Cooldown', value: `${getCooldownSeconds(command)} seconds`, inline: true },
          { name: 'Guild Only', value: command.guildOnly ? 'Yes' : 'No', inline: true },
        );

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const categories = new Map<string, string[]>();
    for (const cmd of client.commands.values()) {
      if (!canUse(cmd, interaction)) continue;
      const label = CATEGORY_LABELS[cmd.category ?? ''] ?? '📦 Other';
      categories.set(label, [...(categories.get(label) ?? []), cmd.data.name]);
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle('🤖 Wall-E Bot Help')
      .setDescription('Commands you can use here.')
      .setThumbnail(client.user!.displayAvatarURL())
      .setFooter({ text: 'Use /help <command> for more info on a specific command' });

    for (const [category, names] of categories) {
      embed.addFields({ name: category, value: names.sort().map(name => `\`/${name}\``).join(' ') });
    }

    if (process.env.DASHBOARD_URL) {
      embed.addFields({ name: '🔗 Links', value: `[Dashboard](${process.env.DASHBOARD_URL})` });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export default command;
