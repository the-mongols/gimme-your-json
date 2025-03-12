import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

// Define the ping command
const pingCommand = {
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    console.log('Ping command executed by', interaction.user.tag);
    await interaction.reply('Pong!');
  }
};

// Export both as default and named export for maximum compatibility
export { pingCommand };
export default pingCommand;
