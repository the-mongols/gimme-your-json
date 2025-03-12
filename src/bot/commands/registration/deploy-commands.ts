import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Function to parse JSON with comments
function parseJsonWithComments(jsonString: string): any {
  // Remove // comments and /* */ comments
  const noComments = jsonString
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments
  
  return JSON.parse(noComments);
}

// Get config values from environment variables
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const token = process.env.DISCORD_BOT_TOKEN;

// Validate required environment variables
if (!clientId || !guildId || !token) {
  console.error('Missing required environment variables in .env.local file.');
  console.error('Required: DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_BOT_TOKEN');
  process.exit(1);
}

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create an array to hold commands
const commands: any[] = [];

// Function to load commands asynchronously
async function loadCommandFiles() {
  console.log('Loading command files for deployment...');
  
  // Check if tsconfig.json exists and load configuration options if needed
  const tsconfigPath = path.join(__dirname, 'tsconfig.json');
  let tsconfig: any = {};
  
  if (fs.existsSync(tsconfigPath)) {
    try {
      const tsconfigRaw = fs.readFileSync(tsconfigPath, 'utf8');
      // Use custom parser instead of JSON.parse
      tsconfig = parseJsonWithComments(tsconfigRaw);
      console.log('Loaded TypeScript configuration from tsconfig.json');
    } catch (error) {
      console.warn('Error loading tsconfig.json:', error);
    }
  } else {
    console.warn('No tsconfig.json found in the project root');
  }
  
  // Determine the commands folder path
  const foldersPath = path.join(__dirname, 'commands');
  
  if (!fs.existsSync(foldersPath)) {
    console.error(`Commands directory not found at ${foldersPath}`);
    return;
  }
  
  console.log(`Looking for commands in: ${foldersPath}`);
  const commandFolders = fs.readdirSync(foldersPath);
  console.log(`Found command folders: ${commandFolders.join(', ')}`);

  for (const folder of commandFolders) {
    // Grab all the command files from the commands directory
    const commandsPath = path.join(foldersPath, folder);
    
    // Skip if not a directory
    if (!fs.existsSync(commandsPath) || !fs.statSync(commandsPath).isDirectory()) {
      console.warn(`${commandsPath} is not a valid directory, skipping`);
      continue;
    }
    
    console.log(`Processing folder: ${folder}`);
    
    const commandFiles = fs.readdirSync(commandsPath).filter(file => 
      file.endsWith('.js') || file.endsWith('.ts')
    );
    
    console.log(`Found command files in ${folder}: ${commandFiles.join(', ')}`);
    
    // Load each command file
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      console.log(`Loading command from: ${filePath}`);
      
      try {
        // Use dynamic import for ESM
        const commandModule = await import(`file://${filePath}`);
        // Handle both default and named exports
        const command = commandModule.default || commandModule;
        
        if ('data' in command && 'execute' in command) {
          commands.push(command.data.toJSON());
          console.log(`✅ Added command: ${command.data.name} for deployment`);
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
async function deployCommands() {
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
    ) as any[];

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error('Error deploying commands:', error);
  }
}

// Execute the deployment
deployCommands();