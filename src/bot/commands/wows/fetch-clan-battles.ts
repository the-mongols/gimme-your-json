// src/bot/commands/wows/fetch-clan-battles.ts
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { fetchClanBattlesData, fetchAllClanBattlesData, exportClanBattlesAsJson } from '../../../services/wargaming/clanbattles.js';
import { ServerConfigService } from '../../../services/server-config.js';
import { handleCommandError } from '../../../utils/errors.js';
import { Logger } from '../../../utils/logger.js';
import { getAllClanTags } from '../../../config/clans.js';
import { Config } from '../../../utils/config.js';

export default {
  category: 'wows',
  cooldown: 30, // Longer cooldown to prevent abuse
  data: new SlashCommandBuilder()
    .setName('fetch-clan-battles')
    .setDescription('Manually fetch clan battles data')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Admin only
    .addStringOption(option =>
      option.setName('clan')
        .setDescription('Clan to fetch data for (defaults to server default, "all" for all clans)')
        .setRequired(false)
        .addChoices(
          { name: "All Clans", value: "all" },
          ...getAllClanTags().map(tag => ({ name: tag, value: tag }))
        ))
    .addBooleanOption(option => 
      option.setName('export')
        .setDescription('Export data as JSON file')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Max battles to export (default: 50, only used with export option)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(500)),
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply();
      
      // Ensure we have a guild context
      if (!interaction.guildId) {
        await interaction.editReply({
          content: 'This command can only be used in a server.',
        });
        return;
      }
      
      // Get the clan option
      const clanOption = interaction.options.getString('clan');
      const exportOption = interaction.options.getBoolean('export') || false;
      const limitOption = interaction.options.getInteger('limit') || 50;
      
      // Get server default clan if no option specified
      let clanTag: string | null = null;
      if (!clanOption) {
        clanTag = await ServerConfigService.getDefaultClanTag(interaction.guildId);
      } else if (clanOption !== 'all') {
        clanTag = clanOption;
      }
      
      await interaction.editReply('Fetching clan battles data, please wait...');
      
      const startTime = Date.now();
      
      // Handle export option
      if (exportOption && clanTag) {
        const jsonData = await exportClanBattlesAsJson(clanTag, limitOption);
        const buffer = Buffer.from(jsonData, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, {
          name: `${clanTag.toLowerCase()}_clan_battles.json`
        });
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        await interaction.editReply({
          content: `Exported clan battles data for ${clanTag} in ${duration}s`,
          files: [attachment]
        });
        return;
      }
      
      // Handle single clan or all clans
      if (clanTag) {
        // Fetch data for a single clan
        const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
        if (!clan) {
          await interaction.editReply(`Error: Clan "${clanTag}" not found in configuration.`);
          return;
        }
        
        const results = await fetchClanBattlesData(clanTag);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Create an embed with results
        const embed = new EmbedBuilder()
          .setTitle(`${clanTag} Clan Battles Data Update`)
          .setDescription(`Clan battles data fetch completed in ${duration}s`)
          .setColor(clan.color)
          .addFields([
            { name: 'Processed', value: results.processed.toString(), inline: true },
            { name: 'New Battles', value: results.newBattles.toString(), inline: true },
            { name: 'Member Entries', value: results.clanMemberPlayers.toString(), inline: true }
          ])
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();
        
        await interaction.editReply({ content: null, embeds: [embed] });
      } else {
        // Fetch data for all clans
        const results = await fetchAllClanBattlesData();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Create an embed with results
        const embed = new EmbedBuilder()
          .setTitle('All Clans Battles Data Update')
          .setDescription(`Clan battles data fetch completed in ${duration}s`)
          .setColor('#0099ff')
          .addFields([
            { name: 'Total Processed', value: results.totalProcessed.toString(), inline: true },
            { name: 'Total New Battles', value: results.totalNew.toString(), inline: true }
          ])
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();
        
        // Add a field for each clan
        for (const clanResult of results.results) {
          const clan = Object.values(Config.clans).find(c => c.tag === clanResult.clan);
          if (!clan) continue;
          
          embed.addFields({
            name: clanResult.clan,
            value: `Processed: ${clanResult.processed}\nNew: ${clanResult.newBattles}\nMembers: ${clanResult.clanMemberPlayers}`,
            inline: true
          });
        }
        
        await interaction.editReply({ content: null, embeds: [embed] });
      }
    } catch (error) {
      await handleCommandError(interaction, error);
    }
  }
};