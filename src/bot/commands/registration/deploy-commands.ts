import { REST, Routes } from 'discord.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Define types for better type safety
type RestResponse = {
  length: number;
};

// Function to parse JSON with comments
function parseJsonWithComments(jsonString: string): any {
  // Remove // comments and /* */ comments
  const noComments = jsonString
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments
  
  return JSON.parse(noComments);
}

// Get config values from environment variables (using Bun's built-in .env support)
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const token = process.env.DISCORD_BOT_TOKEN;

// Validate required environment variables
if (!clientId || !guildId || !token) {
  console.error('Missing required environment variables in .env file.');
  console.error('Required: DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_BOT_TOKEN');
  process.exit(1);
}

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create an array to hold commands
const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];

// Function to load commands asynchronously
async function loadCommandFiles(): Promise<void> {
  console.log('Loading command files for deployment...');
  
  // Define type for command locations
  type CommandLocation = {
    path: string;
    category: string;
  };
  
  // Find all command locations
  const commandLocations: CommandLocation[] = [];
  
  // 1. Look for commands directly in the src/bot/commands directory (excluding registration)
  const commandsBasePath = path.join(__dirname, '..');
  
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
  
  console.log(`Found ${commandLocations.length} command locations to scan`);
  
  // Process each command location
  for (const { path: commandsPath, category } of commandLocations) {
    console.log(`Processing ${category} commands from: ${commandsPath}`);
    
    const commandFiles = fs.readdirSync(commandsPath).filter(file => 
      file.endsWith('.js') || file.endsWith('.ts')
    );
    
    console.log(`Found ${commandFiles.length} command files in ${category}`);
    
    // Load each command file
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      console.log(`Loading command from: ${filePath}`);
      
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
            console.log(`⚠️ Command ${command.data.name} already registered, skipping duplicate`);
          } else {
            commands.push(command.data.toJSON());
            console.log(`✅ Added command: ${command.data.name} for deployment`);
          }
        } else {
          console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
      } catch (error) {
        console.error(`[ERROR] Failed to load command from ${filePath}:`, error);
      }
    }
  }
  
  // Report the total number of commands found
  console.log(`Found ${commands.length} commands to deploy.`);
}

// Deploy commands
async function deployCommands(): Promise<void> {
  try {
    // First load all commands
    await loadCommandFiles();
    
    if (commands.length === 0) {
      console.error('No commands found to deploy. Exiting.');
      return;
    }
    
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // Type assertions for environment variables
    const validToken: string = token as string;
    const validClientId: string = clientId as string;
    const validGuildId: string = guildId as string;
    
    // Construct and prepare an instance of the REST module
    const rest = new REST().setToken(validToken);

    // The put method is used to fully refresh all commands in the guild
    const data = await rest.put(
      Routes.applicationGuildCommands(validClientId, validGuildId),
      { body: commands },
    ) as RestResponse;

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error('Error deploying commands:', error);
  }
}

// Execute the deployment
deployCommands();