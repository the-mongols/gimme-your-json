import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { fetchClanBattlesData } from '../../../services/wargaming/clanbattles.js';

export default {
  category: 'wows',
  cooldown: 30, // Longer cooldown to prevent abuse
  data: new SlashCommandBuilder()
    .setName('fetch-clan-battles')
    .setDescription('Manually fetch clan battles data')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Admin only
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    try {
      await interaction.editReply('Fetching clan battles data, please wait...');
      
      const startTime = Date.now();
      const results = await fetchClanBattlesData();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      await interaction.editReply(
        `Clan battles data fetch completed in ${duration}s:\n` +
        `• Processed ${results.processed} battles\n` +
        `• Added ${results.newBattles} new battles\n` +
        `• Found ${results.pn31Players} PN31 player entries`
      );
    } catch (error) {
      console.error('Error fetching clan battles data:', error);
      await interaction.editReply(`Error fetching clan battles data: ${(error as Error).message}`);
    }
  }
};