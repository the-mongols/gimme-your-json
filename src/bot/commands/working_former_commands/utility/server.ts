import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

const serverCommand = {
	data: new SlashCommandBuilder()
		.setName('server')
		.setDescription('Provides information about the server.'),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		// interaction.guild is the object representing the Guild in which the command was run
		if (!interaction.guild) {
			await interaction.reply('This command can only be used in a server.');
			return;
		}
		await interaction.reply(`This server is ${interaction.guild.name} and has ${interaction.guild.memberCount} members.`);
	},
};

export { serverCommand };
export default serverCommand;
