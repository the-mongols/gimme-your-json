// src/bot/commands/registration/register-commands.ts
import { REST, Routes } from 'discord.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Config } from '../../../utils/config.js';
import { Logger } from '../../../utils/logger.js';

// Define types for better type safety
type RestResponse = {
  length: number;
};

type CommandLocation = {
  path: string;
  category: string;
};

/**
 * Register slash commands with Discord API
 * @param global Whether to register commands globally or for a specific guild
 */
export async function registerCommands(global: boolean = false): Promise<void> {
  try {
    Logger.info(`Starting command registration ${global ? 'globally' : 'for guild'}`);
    
    // Validate required environment variables
    const clientId = Config.discord.clientId;
    const guildId = Config.discord.guildId;
    const token = Config.discord.token;
    
    if (!clientId || !token) {
      throw new Error('Missing required environment variables: DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN');
    }
    
    if (!global && !guildId) {
      throw new Error('Missing DISCORD_GUILD_ID for guild-specific command registration');
    }
    
    // Load command files
    const commands = await loadCommandFiles();
    
    if (commands.length === 0) {
      throw new Error('No commands found to register');
    }
    
    Logger.info(`Registering ${commands.length} commands ${global ? 'globally' : `for guild ${guildId}`}`);
    
    // Set up REST API client
    const rest = new REST().setToken(token);
    
    // Register commands
    const route = global 
      ? Routes.applicationCommands(clientId)
      : Routes.applicationGuildCommands(clientId, guildId!);
    
    const data = await rest.put(route, { body: commands }) as RestResponse;
    
    Logger.info(`Successfully registered ${data.length} commands ${global ? 'globally' : `for guild ${guildId}`}`);
    
    if (global) {
      Logger.info('Note: Global commands may take up to an hour to appear in all servers');
    }
  } catch (error) {
    Logger.error(`Failed to register commands`, error);
    throw error;
  }
}

/**
 * Load all command files and return command data
 */
async function loadCommandFiles(): Promise<RESTPostAPIChatInputApplicationCommandsJSONBody[]> {
  const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
  
  // Get the base path of command files
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const commandsBasePath = path.join(__dirname, '..');
  
  // Find all command locations
  const commandLocations: CommandLocation[] = [];
  
  // 1. Look for commands directly in the src/bot/commands directory (excluding registration)
  fs.readdirSync(commandsBasePath).forEach(item => {
    const itemPath = path.join(commandsBasePath, item);
    if (fs.statSync(itemPath).isDirectory() && item !== 'registration') {
      commandLocations.push({ path: itemPath, category: item });
    }
  });
  
  // 2. Look for commands in working_former_commands subdirectories
  const workingFormerPath = path.join(commandsBasePath, 'working_former_commands');
  if (fs.existsSync(workingFormerPath) && fs.statSync(workingFormerPath).isDirectory()) {
    fs.readdirSync(workingFormerPath).forEach(category => {
      const categoryPath = path.join(workingFormerPath, category);
      if (fs.statSync(categoryPath).isDirectory()) {
        commandLocations.push({ path: categoryPath, category });
      }
    });
  }
  
  Logger.info(`Found ${commandLocations.length} command locations to scan`);
  
  // Process each command location
  for (const { path: commandsPath, category } of commandLocations) {
    Logger.debug(`Processing ${category} commands from: ${commandsPath}`);
    
    const commandFiles = fs.readdirSync(commandsPath).filter(file => 
      file.endsWith('.js') || file.endsWith('.ts')
    );
    
    Logger.debug(`Found ${commandFiles.length} command files in ${category}`);
    
    // Load each command file
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      Logger.debug(`Loading command from: ${filePath}`);
      
      try {
        // Use dynamic import for ESM
        const commandModule = await import(`file://${filePath}`);
        // Handle both default and named exports
        const command = commandModule.default || commandModule;
        
        if (command && 'data' in command && 'execute' in command) {
          // Check if command is already in the array to avoid duplicates
          const existingCommandIndex = commands.findIndex(cmd => 
            cmd.name === command.data.name
          );
          
          if (existingCommandIndex >= 0) {
            Logger.warn(`Command ${command.data.name} already registered, skipping duplicate`);
          } else {
            commands.push(command.data.toJSON());
            Logger.debug(`Added command: ${command.data.name} for deployment`);
          }
        } else {
          Logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
      } catch (error) {
        Logger.error(`Failed to load command from ${filePath}`, error);
      }
    }
  }
  
  Logger.info(`Loaded ${commands.length} commands successfully`);
  return commands;
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const isGlobal = process.argv.includes('--global');
    registerCommands(isGlobal)
      .then(() => {
        process.exit(0);
      })
      .catch(error => {
        Logger.error('Command registration failed', error);
        process.exit(1);
      });
  }