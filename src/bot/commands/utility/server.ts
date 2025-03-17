import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

const serverCommand = {
  category: 'utility', // Adding explicit category
  cooldown: 5, // Adding standard cooldown
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Provides information about the server.'),
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // interaction.guild is the object representing the Guild in which the command was run
    if (!interaction.guild) {
      await interaction.reply({ 
        content: 'This command can only be used in a server.', 
        ephemeral: true 
      });
      return;
    }
    
    // Get server creation date
    const creationDate = interaction.guild.createdAt.toLocaleDateString();
    
    // Get additional info
    const serverInfo = {
      name: interaction.guild.name,
      id: interaction.guild.id,
      memberCount: interaction.guild.memberCount,
      createdAt: creationDate,
      channels: interaction.guild.channels.cache.size,
      roles: interaction.guild.roles.cache.size,
      owner: (await interaction.guild.fetchOwner()).user.tag,
      boostLevel: interaction.guild.premiumTier,
      boostCount: interaction.guild.premiumSubscriptionCount
    };
    
    // Reply with formatted server info
    await interaction.reply({
      content: `**Server Information for ${serverInfo.name}**
📋 **ID:** ${serverInfo.id}
👥 **Members:** ${serverInfo.memberCount}
📅 **Created:** ${serverInfo.createdAt}
📣 **Channels:** ${serverInfo.channels}
🏷️ **Roles:** ${serverInfo.roles}
👑 **Owner:** ${serverInfo.owner}
🚀 **Boost Level:** ${serverInfo.boostLevel}
💎 **Boost Count:** ${serverInfo.boostCount}`,
      ephemeral: false
    });
  },
};

export { serverCommand };
export default serverCommand;