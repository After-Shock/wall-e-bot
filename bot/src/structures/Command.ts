import type {
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder,
  ChatInputCommandInteraction,
  PermissionResolvable,
} from 'discord.js';
import type { WallEClient } from './Client.js';

export type CommandData = 
  | SlashCommandBuilder 
  | SlashCommandSubcommandsOnlyBuilder 
  | SlashCommandOptionsOnlyBuilder
  | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

export interface Command {
  data: CommandData;
  cooldown?: number; // seconds
  permissions?: PermissionResolvable[];
  ownerOnly?: boolean;
  guildOnly?: boolean;
  execute: (client: WallEClient, interaction: ChatInputCommandInteraction) => Promise<void>;
}
