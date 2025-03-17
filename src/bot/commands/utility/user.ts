import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';

const userCommand = {
  category: 'utility', // Adding explicit category
  cooldown: 5, // Adding standard cooldown
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('Provides information about the user.'),
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const member = interaction.member as GuildMember | null;
    
    if (!member) {
      await interaction.reply({ 
        content: 'Could not retrieve member information.', 
        ephemeral: true 
      });
      return;
    }
    
    // Get user information
    const roles = member.roles.cache
      .filter(role => role.id !== interaction.guild?.id) // Filter out @everyone role
      .map(role => role.toString())
      .join(', ') || 'None';
      
    const joinDate = member.joinedAt?.toLocaleDateString() || 'Unknown';
    const accountDate = interaction.user.createdAt.toLocaleDateString();
    
    // Reply with formatted user info
    await interaction.reply({
      content: `**User Information for ${interaction.user.username}**
👤 **Username:** ${interaction.user.username}
🆔 **ID:** ${interaction.user.id}
📅 **Joined Server:** ${joinDate}
🗓️ **Account Created:** ${accountDate}
🎭 **Roles:** ${roles}`,
      ephemeral: false
    });
  },
};

export { userCommand };
export default userCommand;