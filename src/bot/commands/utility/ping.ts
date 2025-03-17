import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

// Define the ping command
const pingCommand = {
  category: 'utility', // Adding explicit category
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    console.log('Ping command executed by', interaction.user.tag);
    
    // Get API ping
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const ping = sent.createdTimestamp - interaction.createdTimestamp;
    
    // Edit the reply with the calculated ping
    await interaction.editReply(`Pong! 🏓\nBot Latency: ${ping}ms\nAPI Latency: ${Math.round(interaction.client.ws.ping)}ms`);
  }
};

// Export both as default and named export for maximum compatibility
export { pingCommand };
export default pingCommand;