// src/bot/commands/utility/clan.ts
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Config } from '../../../utils/config.js';
import { getAllClanTags } from '../../../config/clans.js';
import { Logger } from '../../../utils/logger.js';

export default {
  category: 'utility',
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('clan')
    .setDescription('View or set clan configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all available clans'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('Get information about a specific clan')
        .addStringOption(option =>
          option.setName('clan_tag')
            .setDescription('Clan tag (e.g., "PN31")')
            .setRequired(true)
            .addChoices(...getAllClanTags().map(tag => ({ name: tag, value: tag })))))
    .addSubcommand(subcommand =>
      subcommand
        .setName('set_default')
        .setDescription('Set the default clan for this server')
        .addStringOption(option =>
          option.setName('clan_tag')
            .setDescription('Clan tag (e.g., "PN31")')
            .setRequired(true)
            .addChoices(...getAllClanTags().map(tag => ({ name: tag, value: tag }))))),
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'list':
        return await handleListClans(interaction);
      case 'info':
        return await handleClanInfo(interaction);
      case 'set_default':
        return await handleSetDefaultClan(interaction);
      default:
        await interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true
        });
    }
  }
};

/**
 * Handle the "list" subcommand to show all configured clans
 */
async function handleListClans(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const clans = Object.values(Config.clans);
    
    const embed = new EmbedBuilder()
      .setTitle('Configured Clans')
      .setDescription(`This bot is configured to work with ${clans.length} clans.`)
      .setColor('#0099ff')
      .addFields(
        clans.map(clan => ({
          name: `${clan.tag} (${clan.name})`,
          value: `ID: ${clan.id}\nRegion: ${clan.region.toUpperCase()}\nCookies: ${clan.cookies ? '✅ Configured' : '❌ Missing'}`,
          inline: true
        }))
      )
      .setFooter({ text: `Default Clan: ${Config.defaultClan.tag}` })
      .setTimestamp();
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  } catch (error) {
    Logger.error('Error listing clans:', error);
    await interaction.reply({
      content: `Error listing clans: ${(error as Error).message}`,
      ephemeral: true
    });
  }
}

/**
 * Handle the "info" subcommand to show details for a specific clan
 */
async function handleClanInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const clanTag = interaction.options.getString('clan_tag', true);
    const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
    
    if (!clan) {
      await interaction.reply({
        content: `Clan with tag "${clanTag}" not found in configuration.`,
        ephemeral: true
      });
      return;
    }
    
    // Defer reply while we fetch extra information
    await interaction.deferReply({ ephemeral: true });
    
    // If we're in a guild, check if this is the default clan
    let isServerDefault = false;
    let serverName = 'Global';
    
    if (interaction.guildId) {
      // Import ServerConfigService - done here to avoid circular imports
      const { ServerConfigService } = await import('../../../services/server-config.js');
      
      // Get default clan for this server
      const defaultClanTag = await ServerConfigService.getDefaultClanTag(interaction.guildId);
      isServerDefault = (defaultClanTag === clan.tag);
      serverName = interaction.guild?.name || interaction.guildId;
    }
    
    // Get more clan info from WG API
    let clanInfo = null;
    try {
      // Import the API client - done here to avoid circular imports
      const { getApiClientForClan } = await import('../../../services/wargaming/client.js');
      const apiClient = getApiClientForClan(clan.tag);
      
      // Try to fetch clan info from WG API
      clanInfo = await apiClient.getClanInfo(clan.id);
    } catch (error) {
      Logger.warn(`Could not fetch WG API data for clan ${clan.tag}:`, error);
      // Continue without API data, not critical
    }
    
    // Build the embed with all available information
    const embed = new EmbedBuilder()
      .setTitle(`Clan: ${clan.tag}`)
      .setDescription(clan.name)
      .setColor(clan.color)
      .addFields([
        { name: 'ID', value: clan.id.toString(), inline: true },
        { name: 'Region', value: clan.region.toUpperCase(), inline: true },
        { name: 'API Access', value: clan.cookies ? '✅ Configured' : '❌ Missing', inline: true },
        { name: 'Default', value: isServerDefault ? `✅ Yes (for ${serverName})` : '❌ No', inline: true },
      ]);
    
    // Add WG API data if available
    if (clanInfo) {
      embed.addFields([
        { name: 'Members', value: clanInfo.members_count?.toString() || 'Unknown', inline: true },
        { name: 'Created', value: clanInfo.created_at ? new Date(clanInfo.created_at * 1000).toLocaleDateString() : 'Unknown', inline: true },
        { name: 'Description', value: clanInfo.description || 'No description' }
      ]);
      
      // Add clan logo if available
      if (clanInfo.emblems?.clan) {
        embed.setThumbnail(clanInfo.emblems.clan.wowp_medium);
      }
    }
    
    embed.setTimestamp();
    
    await interaction.editReply({
      embeds: [embed]
    });
  } catch (error) {
    Logger.error('Error displaying clan info:', error);
    
    // Make sure we respond to the interaction
    if (interaction.deferred) {
      await interaction.editReply({
        content: `Error displaying clan info: ${(error as Error).message}`
      });
    } else {
      await interaction.reply({
        content: `Error displaying clan info: ${(error as Error).message}`,
        ephemeral: true
      });
    }
  }
}

/**
 * Handle the "set_default" subcommand to set the default clan
 */
async function handleSetDefaultClan(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    // Make sure we have a guild (server) context
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true
      });
      return;
    }
    
    const clanTag = interaction.options.getString('clan_tag', true);
    const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
    
    if (!clan) {
      await interaction.reply({
        content: `Clan with tag "${clanTag}" not found in configuration.`,
        ephemeral: true
      });
      return;
    }
    
    // Defer reply while we update the database
    await interaction.deferReply({ ephemeral: true });
    
    // Import ServerConfigService - done here to avoid circular imports
    const { ServerConfigService } = await import('../../../services/server-config.js');
    
    // Set the default clan for this server
    await ServerConfigService.setDefaultClanTag(interaction.guildId, clanTag);
    
    // Get current server config to confirm the change
    const serverConfig = await ServerConfigService.getServerConfig(interaction.guildId);
    
    // Create a nice embed for the response
    const embed = new EmbedBuilder()
      .setTitle('Default Clan Updated')
      .setDescription(`The default clan for this server has been set to ${clan.tag}.`)
      .setColor(clan.color)
      .addFields([
        { name: 'Server ID', value: interaction.guildId, inline: true },
        { name: 'Default Clan', value: serverConfig.defaultClanTag || 'None', inline: true },
        { name: 'Region', value: clan.region.toUpperCase(), inline: true }
      ])
      .setFooter({ text: `Updated by ${interaction.user.tag}` })
      .setTimestamp();
    
    await interaction.editReply({
      embeds: [embed]
    });
    
    // Log the change
    Logger.info(`Server ${interaction.guildId} default clan set to ${clanTag} by ${interaction.user.tag}`);
  } catch (error) {
    Logger.error('Error setting default clan:', error);
    
    // Make sure we respond to the interaction
    if (interaction.deferred) {
      await interaction.editReply({
        content: `Error setting default clan: ${(error as Error).message}`
      });
    } else {
      await interaction.reply({
        content: `Error setting default clan: ${(error as Error).message}`,
        ephemeral: true
      });
    }
  }
}