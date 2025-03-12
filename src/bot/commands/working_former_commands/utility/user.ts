import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';

const userCommand = {
	data: new SlashCommandBuilder()
		.setName('user')
		.setDescription('Provides information about the user.'),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		const member = interaction.member as GuildMember | null;
		if (!member) {
			await interaction.reply('Could not retrieve member information.');
			return;
		}
		await interaction.reply(`This command was run by ${interaction.user.username}, who joined on ${member.joinedAt?.toDateString()}.`);
	},
};

export { userCommand };
export default userCommand;
