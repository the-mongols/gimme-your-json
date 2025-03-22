// src/bot/commands/wows/update-clan.ts
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { updateClanPlayersData, updateAllClansPlayerStats } from '../../../services/dataupdater.js';
import { ServerConfigService } from '../../../services/server-config.js';
import { Logger } from '../../../utils/logger.js';
import { getAllClanTags } from '../../../config/clans.js';
import { Config } from '../../../utils/config.js';

export default {
  category: 'wows',
  cooldown: 600, // 10 minute cooldown to prevent API abuse
  data: new SlashCommandBuilder()
    .setName('update-clan')
    .setDescription('Manually update all players data for a clan')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Admin only
    .addStringOption(option =>
      option.setName('clan')
        .setDescription('Clan to update (defaults to server default, "all" for all clans)')
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
      
      await interaction.editReply('Starting player data update, please wait. This may take several minutes for a large roster...');
      
      const startTime = Date.now();
      
      if (clanTag) {
        // Update a single clan
        const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
        if (!clan) {
          await interaction.editReply(`Error: Clan "${clanTag}" not found in configuration.`);
          return;
        }
        
        // Update the clan data
        const results = await updateClanPlayersData(clan);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Create an embed with results
        const embed = new EmbedBuilder()
          .setTitle(`${clanTag} Players Update`)
          .setDescription(`Update completed in ${duration}s`)
          .setColor(clan.color)
          .addFields([
            { name: 'Success', value: results.success.toString(), inline: true },
            { name: 'Failed', value: results.failed.toString(), inline: true },
            { name: 'Total', value: (results.success + results.failed).toString(), inline: true }
          ])
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();
        
        await interaction.editReply({ content: null, embeds: [embed] });
      } else {
        // Update all clans
        const results = await updateAllClansPlayerStats();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Create an embed with results
        const embed = new EmbedBuilder()
          .setTitle('All Clans Players Update')
          .setDescription(`Update completed in ${duration}s`)
          .setColor('#0099ff')
          .addFields([
            { name: 'Total Success', value: results.totalSuccess.toString(), inline: true },
            { name: 'Total Failed', value: results.totalFailed.toString(), inline: true },
            { name: 'Total Players', value: (results.totalSuccess + results.totalFailed).toString(), inline: true }
          ])
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();
        
        // Add a field for each clan
        for (const clanResult of results.results) {
          const clan = Object.values(Config.clans).find(c => c.tag === clanResult.clan);
          if (!clan) continue;
          
          embed.addFields({
            name: clanResult.clan,
            value: `Success: ${clanResult.success}\nFailed: ${clanResult.failed}`,
            inline: true
          });
        }
        
        await interaction.editReply({ content: null, embeds: [embed] });
      }
    } catch (error) {
      Logger.error('Error updating clan data:', error);
      await interaction.editReply(`Error updating clan data: ${(error as Error).message}`);
    }
  }
};