import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// Get the current file and directory path for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Reloads a command.')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('The command to reload.')
                .setRequired(true)),
    async execute(interaction: ChatInputCommandInteraction) {
        const commandName = interaction.options.getString('command', true).toLowerCase();
        const command = interaction.client.commands.get(commandName);

        if (!command) {
            return interaction.reply(`There is no command with name \`${commandName}\`!`);
        }

        const commandFolderPath = path.join(__dirname, '..', command.category);
        const commandFilePath = path.join(commandFolderPath, `${command.data.name}.ts`);
        
        // Check if the file exists
        if (!fs.existsSync(commandFilePath)) {
            return interaction.reply(`Could not find the command file at \`${commandFilePath}\`!`);
        }

        try {
            // Remove the command from the collection
            interaction.client.commands.delete(command.data.name);
            
            // Use dynamic import for ESM modules
            const fileUrl = `file://${commandFilePath}`;
            
            // Force reload by appending timestamp to bypass cache
            const newCommandModule = await import(`${fileUrl}?update=${Date.now()}`);
            
            // Handle both default and named exports
            const newCommand = newCommandModule.default || newCommandModule;
            
            // Validate the new command
            if (!('data' in newCommand) || !('execute' in newCommand)) {
                return interaction.reply(`The reloaded command at \`${commandFilePath}\` is missing required properties!`);
            }
            
            // Add the reloaded command to the collection
            interaction.client.commands.set(newCommand.data.name, newCommand);
            await interaction.reply(`Command \`${newCommand.data.name}\` was reloaded!`);
        } catch (error) {
            console.error(error);
            await interaction.reply(`There was an error while reloading command \`${command.data.name}\`:\n\`${(error as Error).message}\``);
        }
    },
};