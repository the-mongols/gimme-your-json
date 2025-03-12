import { REST, Routes } from 'discord.js';

// Define types for better type safety
type RestResponse = {
  length: number;
};

// Get config values from environment variables
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const token = process.env.DISCORD_BOT_TOKEN;

// Validate required environment variables
if (!clientId || !token) {
  console.error('Missing required environment variables in .env.local file.');
  console.error('Required: DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN');
  process.exit(1);
}

// Clear commands
async function clearCommands(): Promise<void> {
  try {
    console.log('Clearing application commands...');

    // Type assertions for environment variables
    const validToken: string = token as string;
    const validClientId: string = clientId as string;
    
    // Construct and prepare an instance of the REST module
    const rest = new REST().setToken(validToken);

    // Ask user if they want to clear globally or for a specific guild
    const clearGlobally = !guildId || process.argv.includes('--global');
    
    if (clearGlobally) {
      console.log('Clearing commands globally...');
      // The put method with empty array removes all commands
      const response = await rest.put(
        Routes.applicationCommands(validClientId),
        { body: [] },
      ) as RestResponse;
      console.log(`Successfully cleared all global application commands (${response.length} removed).`);
    } else {
      console.log(`Clearing commands for guild ID: ${guildId}`);
      // The put method with empty array removes all commands from the guild
      const response = await rest.put(
        Routes.applicationGuildCommands(validClientId, guildId as string),
        { body: [] },
      ) as RestResponse;
      console.log(`Successfully cleared all application commands for guild ID: ${guildId} (${response.length} removed).`);
    }
    
  } catch (error) {
    console.error('Error clearing commands:', error);
  }
}

// Execute the clear operation
clearCommands();