import { Collection, Events, MessageFlags } from 'discord.js';
import type { Interaction } from 'discord.js';

export default {
    name: Events.InteractionCreate,
    execute: async (interaction: Interaction) => {
        console.log(`Received interaction: ${interaction.type} from ${interaction.user.tag}`);
        
        if(!interaction.isChatInputCommand()) {
            console.log('Interaction is not a chat input command, ignoring.');
            return;
        }
        
        const client = interaction.client;
        console.log(`Processing command: ${interaction.commandName}`);
        const command = client.commands.get(interaction.commandName);

        // Check if command exists early
        if (!command) {
            console.error(`❌ No command matching ${interaction.commandName} was found.`);
            await interaction.reply({
                content: 'Unknown command. Try using a registered slash command.',
                ephemeral: true
            });
            return;
        }

        const { cooldowns } = interaction.client;

        if (!cooldowns.has(command.data.name)) {
            cooldowns.set(command.data.name, new Collection());
        }

        const now = Date.now();
        const timestamps = cooldowns.get(command.data.name);
        const defaultCooldownDuration = 3;
        const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1_100;

        if (timestamps && timestamps.has(interaction.user.id)) {
            // Use non-null assertion or type guard to handle the potential undefined
            const userTimestamp = timestamps.get(interaction.user.id);
            if (userTimestamp) {  // Add this check to satisfy TypeScript
                const expirationTime = userTimestamp + cooldownAmount;

                if (now < expirationTime) {
                    const expiredTimestamp = Math.round(expirationTime / 1_100);
                    return interaction.reply({ 
                        content: `Please wait, you are on a cooldown for \`${command.data.name}\`. You can use it again <t:${expiredTimestamp}:R>.`, 
                        ephemeral: true 
                    });
                }
            }
        }

        if (timestamps) {
            timestamps.set(interaction.user.id, now);
            setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
        }

        try {
            console.log(`Executing command: ${interaction.commandName}`);
            await command.execute(interaction);
            console.log(`✅ Command ${interaction.commandName} executed successfully`);
        } catch (error) {
            console.error(`❌ Error executing command ${interaction.commandName}:`, error);
            
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: 'There was an error while executing this command!',
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: 'There was an error while executing this command!',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    }
};