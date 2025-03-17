import { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { db } from '../../../database/db.js';
import { players } from '../../../database/drizzle/schema.js';

export default {
  category: 'roster',
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('roster-export')
    .setDescription('Export roster data or create empty template')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addBooleanOption(option =>
      option.setName('template_only')
        .setDescription('Only create an empty template without player data')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const templateOnly = interaction.options.getBoolean('template_only') ?? false;
      
      if (templateOnly) {
        // Create and send empty template
        const templateData = [
          ['discord_id', 'player_id', 'player_name', 'clan_tag'],
          ['123456789012345678', '123456789', 'PlayerName', 'CLAN'],
          // Add more example rows as needed
        ];
        
        // Convert to CSV manually since we're not importing Papa
        const csv = templateData.map(row => row.join(',')).join('\n');
        const attachment = new AttachmentBuilder(Buffer.from(csv), { name: 'roster_template.csv' });
        
        await interaction.editReply({
          content: 'Here is an empty roster template CSV. Fill it with player data and use `/roster-import` to bulk import players.',
          files: [attachment]
        });
        return;
      }
      
      // Export actual roster data
      const allPlayers = await db.select().from(players);
      
      if (allPlayers.length === 0) {
        await interaction.editReply('The roster is currently empty. Add players with `/roster add` or use `/roster-export template_only:true` to get a template.');
        return;
      }
      
      // Format for CSV export
      const csvData = [
        ['discord_id', 'player_id', 'player_name', 'clan_tag']
      ];
      
      for (const player of allPlayers) {
        csvData.push([
          player.discordId,
          player.id,
          player.username,
          player.clanTag || ''
        ]);
      }
      
      // Convert to CSV manually
      const csv = csvData.map(row => row.join(',')).join('\n');
      const attachment = new AttachmentBuilder(Buffer.from(csv), { 
        name: `roster_export_${new Date().toISOString().split('T')[0]}.csv` 
      });
      
      await interaction.editReply({
        content: `Current roster exported with ${allPlayers.length} players.`,
        files: [attachment]
      });
      
    } catch (error) {
      console.error('Error exporting roster:', error);
      await interaction.editReply(`Failed to export roster: ${(error as Error).message}`);
    }
  }
};