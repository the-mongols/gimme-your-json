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
        // Check if the user has admin permission
        if (!interaction.memberPermissions?.has('Administrator')) {
            return interaction.reply({
                content: 'You need administrator permission to use this command.',
                ephemeral: true
            });
        }
        
        const commandName = interaction.options.getString('command', true).toLowerCase();
        const command = interaction.client.commands.get(commandName);

        if (!command) {
            return interaction.reply(`There is no command with name \`${commandName}\`!`);
        }

        // Try to find the command file
        let commandFilePath = '';
        
        // Look in regular command folders
        const commandsDir = path.join(__dirname, '..');
        const categories = fs.readdirSync(commandsDir)
            .filter(dir => fs.statSync(path.join(commandsDir, dir)).isDirectory() && dir !== 'registration');
            
        // Check each category folder
        for (const category of categories) {
            const folderPath = path.join(commandsDir, category);
            const filePath = path.join(folderPath, `${commandName}.ts`);
            
            if (fs.existsSync(filePath)) {
                commandFilePath = filePath;
                break;
            }
        }
        
        // Also check working_former_commands if not found
        if (!commandFilePath) {
            const workingFormerDir = path.join(commandsDir, 'working_former_commands');
            if (fs.existsSync(workingFormerDir)) {
                const workingCategories = fs.readdirSync(workingFormerDir)
                    .filter(dir => fs.statSync(path.join(workingFormerDir, dir)).isDirectory());
                    
                // Check each category folder within working_former_commands
                for (const category of workingCategories) {
                    const folderPath = path.join(workingFormerDir, category);
                    const filePath = path.join(folderPath, `${commandName}.ts`);
                    
                    if (fs.existsSync(filePath)) {
                        commandFilePath = filePath;
                        break;
                    }
                }
            }
        }
        
        // Check if the file was found
        if (!commandFilePath) {
            return interaction.reply(`Could not find the command file for \`${commandName}\`!`);
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