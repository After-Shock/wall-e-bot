import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure Wall-E Bot for your server')
    .addSubcommand(subcommand =>
      subcommand
        .setName('welcome')
        .setDescription('Set up welcome messages')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel for welcome messages')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true))
        .addStringOption(option =>
          option.setName('message')
            .setDescription('Welcome message (use {user}, {server}, {memberCount})')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('modlog')
        .setDescription('Set up moderation logging')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel for mod logs')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('leveling')
        .setDescription('Enable or disable the leveling system')
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Enable leveling?')
            .setRequired(true))
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel for level up messages (leave empty for current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View current server configuration'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  
  permissions: [PermissionFlagsBits.ManageGuild],
  guildOnly: true,

  async execute(client, interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Get or create config
    let config = await client.db.getGuildConfig(interaction.guild!.id);
    if (!config) {
      config = {
        guildId: interaction.guild!.id,
        prefix: '!',
        language: 'en',
        timezone: 'UTC',
        premium: false,
        modules: {
          moderation: true,
          automod: false,
          leveling: false,
          welcome: false,
          logging: false,
          reactionRoles: true,
          starboard: false,
          customCommands: true,
        },
        moderation: {
          warnThresholds: { kick: 3, ban: 5 },
          autoDeleteModCommands: false,
          dmOnAction: true,
        },
        automod: {
          enabled: false,
          antiSpam: { enabled: false, maxMessages: 5, interval: 5, action: 'warn' },
          wordFilter: { enabled: false, words: [], action: 'delete' },
          linkFilter: { enabled: false, allowedDomains: [], action: 'delete' },
          capsFilter: { enabled: false, threshold: 70, minLength: 10, action: 'delete' },
          ignoredChannels: [],
          ignoredRoles: [],
        },
        leveling: {
          enabled: false,
          xpPerMessage: { min: 15, max: 25 },
          xpCooldown: 60,
          levelUpMessage: 'Congratulations {user}! You reached level **{level}**!',
          roleRewards: [],
          ignoredChannels: [],
          ignoredRoles: [],
          xpMultipliers: [],
        },
        welcome: {
          enabled: false,
          message: 'Welcome to {server}, {user}! You are member #{memberCount}.',
          embedEnabled: true,
          dmEnabled: false,
          leaveEnabled: false,
        },
        logging: {
          enabled: false,
          events: {
            messageDelete: true,
            messageEdit: true,
            memberJoin: true,
            memberLeave: true,
            memberBan: true,
            memberUnban: true,
            roleCreate: false,
            roleDelete: false,
            channelCreate: false,
            channelDelete: false,
            voiceStateUpdate: false,
            nicknameChange: false,
            usernameChange: false,
          },
          ignoredChannels: [],
        },
        starboard: {
          enabled: false,
          threshold: 3,
          emoji: '⭐',
          selfStar: false,
          ignoredChannels: [],
        },
      };
    }

    switch (subcommand) {
      case 'welcome': {
        const channel = interaction.options.getChannel('channel', true);
        const message = interaction.options.getString('message') || config.welcome.message;

        config.modules.welcome = true;
        config.welcome.enabled = true;
        config.welcome.channelId = channel.id;
        config.welcome.message = message;

        await client.db.upsertGuildConfig(config);
        await client.cache.invalidateGuildConfig(interaction.guild!.id);

        await interaction.reply({
          embeds: [successEmbed('Welcome Messages Configured', `Welcome messages will be sent to ${channel}.\n\n**Preview:**\n${message.replace('{user}', interaction.user.toString()).replace('{server}', interaction.guild!.name).replace('{memberCount}', interaction.guild!.memberCount.toString())}`)]
        });
        break;
      }

      case 'modlog': {
        const channel = interaction.options.getChannel('channel', true);

        config.moderation.modLogChannelId = channel.id;
        config.logging.enabled = true;
        config.logging.channelId = channel.id;

        await client.db.upsertGuildConfig(config);
        await client.cache.invalidateGuildConfig(interaction.guild!.id);

        await interaction.reply({
          embeds: [successEmbed('Mod Log Configured', `Moderation actions will be logged in ${channel}.`)]
        });
        break;
      }

      case 'leveling': {
        const enabled = interaction.options.getBoolean('enabled', true);
        const channel = interaction.options.getChannel('channel');

        config.modules.leveling = enabled;
        config.leveling.enabled = enabled;
        if (channel) {
          config.leveling.levelUpChannel = channel.id;
        }

        await client.db.upsertGuildConfig(config);
        await client.cache.invalidateGuildConfig(interaction.guild!.id);

        await interaction.reply({
          embeds: [successEmbed('Leveling System', `Leveling has been **${enabled ? 'enabled' : 'disabled'}**.${channel ? `\nLevel up messages will be sent to ${channel}.` : ''}`)]
        });
        break;
      }

      case 'view': {
        const embed = new EmbedBuilder()
          .setColor(COLORS.PRIMARY)
          .setTitle('⚙️ Server Configuration')
          .addFields(
            { name: '📝 Prefix', value: config.prefix, inline: true },
            { name: '🌐 Language', value: config.language, inline: true },
            { name: '⭐ Premium', value: config.premium ? 'Yes' : 'No', inline: true },
            { name: '📦 Modules', value: Object.entries(config.modules).map(([k, v]) => `${v ? '✅' : '❌'} ${k}`).join('\n') },
            { name: '👋 Welcome Channel', value: config.welcome.channelId ? `<#${config.welcome.channelId}>` : 'Not set', inline: true },
            { name: '📋 Mod Log Channel', value: config.moderation.modLogChannelId ? `<#${config.moderation.modLogChannelId}>` : 'Not set', inline: true }
          )
          .setFooter({ text: 'Use /setup <category> to configure settings' });

        await interaction.reply({ embeds: [embed] });
        break;
      }
    }
  },
};

export default command;
