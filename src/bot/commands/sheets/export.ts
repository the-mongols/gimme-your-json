// src/bot/commands/sheets/export.ts
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { uploadClanDataToSheet, uploadDataToSheets } from '../../../services/sheets/client.js';
import { ServerConfigService } from '../../../services/server-config.js';
import { Logger } from '../../../utils/logger.js';
import { getAllClanTags } from '../../../config/clans.js';
import { Config } from '../../../utils/config.js';

export default {
  category: 'sheets',
  cooldown: 60, // Longer cooldown due to API limits
  data: new SlashCommandBuilder()
    .setName('export-sheets')
    .setDescription('Export player and ship data to Google Sheets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Admin only
    .addStringOption(option =>
      option.setName('clan')
        .setDescription('Clan to export data for (defaults to server default, "all" for all clans)')
        .setRequired(false)
        .addChoices(
          { name: "All Clans", value: "all" },
          ...getAllClanTags().map(tag => ({ name: tag, value: tag }))
        )),
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    try {
      // Ensure we have a guild context
      if (!interaction.guildId) {
        await interaction.editReply({
          content: 'This command can only be used in a server.',
        });
        return;
      }
      
      // Get the clan option
      const clanOption = interaction.options.getString('clan');
      
      // Get server default clan if no option specified
      let clanTag: string | null = null;
      if (!clanOption) {
        clanTag = await ServerConfigService.getDefaultClanTag(interaction.guildId);
      } else if (clanOption !== 'all') {
        clanTag = clanOption;
      }
      
      await interaction.editReply('Exporting data to Google Sheets, please wait...');
      
      const startTime = Date.now();
      
      if (clanTag) {
        // Export data for a single clan
        const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
        if (!clan) {
          await interaction.editReply(`Error: Clan "${clanTag}" not found in configuration.`);
          return;
        }
        
        // Get clan-specific sheet ID if available, or fallback to default
        const sheetId = process.env[`GOOGLE_SHEET_ID_${clanTag}`] || Config.google.sheetId;
        
        if (!sheetId) {
          await interaction.editReply(`Error: No Google Sheet ID configured for clan ${clanTag}.`);
          return;
        }
        
        const success = await uploadClanDataToSheet(clanTag, sheetId);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Create an embed with results
        const embed = new EmbedBuilder()
          .setTitle(`${clanTag} Data Export`)
          .setDescription(`Data export to Google Sheets completed in ${duration}s`)
          .setColor(clan.color)
          .addFields([
            { name: 'Status', value: success ? '✅ Success' : '❌ Failed', inline: true },
            { name: 'Sheet ID', value: sheetId.substring(0, 10) + '...', inline: true }
          ])
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();
        
        await interaction.editReply({ content: null, embeds: [embed] });
      } else {
        // Export data for all clans
        const results = await uploadDataToSheets();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Create an embed with results
        const embed = new EmbedBuilder()
          .setTitle('All Clans Data Export')
          .setDescription(`Data export to Google Sheets completed in ${duration}s`)
          .setColor('#0099ff')
          .addFields([
            { name: 'Total Success', value: results.totalSuccess.toString(), inline: true },
            { name: 'Total Clans', value: results.results.length.toString(), inline: true }
          ])
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();
        
        // Add a field for each clan
        for (const clanResult of results.results) {
          const clan = Object.values(Config.clans).find(c => c.tag === clanResult.clan);
          if (!clan) continue;
          
          embed.addFields({
            name: clanResult.clan,
            value: clanResult.success ? '✅ Success' : '❌ Failed',
            inline: true
          });
        }
        
        await interaction.editReply({ content: null, embeds: [embed] });
      }
    } catch (error) {
      Logger.error('Error exporting data to Google Sheets:', error);
      await interaction.editReply(`Error exporting data: ${(error as Error).message}`);
    }
  }
};