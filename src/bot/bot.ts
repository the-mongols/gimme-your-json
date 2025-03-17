// ./src/bot -> Core bot logic for Discord.js 


// Core bot initialization file

// Import required discord.js classes
import {
    Client, 
    Collection, 
    GatewayIntentBits, 
    Partials, 
    REST
} from 'discord.js';
import type { Interaction, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import fs from 'node:fs'; 
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import database connection
import { db } from '../database/db.js';

// Define Command interface with proper types
export interface Command {
    category?: string; // Category is optional
    data: SlashCommandBuilder | any; // Allow any for complex builders with options
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    cooldown?: number; // Cooldown is optional
}

// Extend Client type for TypeScript support
declare module 'discord.js' {
    export interface Client {
        commands: Collection<string, Command>;
        cooldowns: Collection<string, Collection<string, number>>;
    }
}

// Get current file and directory path for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate environment variables
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
    console.error('Missing DISCORD_BOT_TOKEN environment variable');
    process.exit(1);
}

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [
        Partials.Channel
    ]
});

// Initialize commands collection
client.commands = new Collection<string, Command>();
client.cooldowns = new Collection();

// Command loading function
async function loadCommands() {
    console.log('Starting to load commands...');

    const foldersPath = path.join(__dirname, 'commands');
    console.log(`Looking for commands in: ${foldersPath}`);

    if (!fs.existsSync(foldersPath)) {
        console.error(`Commands directory not found at: ${foldersPath}`);
        return;
    }

    // Load commands from direct category folders (except registration)
    const commandFolders = fs.readdirSync(foldersPath).filter(folder => {
        const folderPath = path.join(foldersPath, folder);
        return fs.existsSync(folderPath) && 
               fs.statSync(folderPath).isDirectory() && 
               folder !== 'registration'; // Skip registration folder
    });
    
    console.log(`Found command folders: ${commandFolders.join(', ')}`);

    // Process regular command folders
    for (const folder of commandFolders) {
        await loadCommandsFromFolder(path.join(foldersPath, folder), folder);
    }
    
    // Also check working_former_commands directory
    const workingFormerPath = path.join(foldersPath, 'working_former_commands');
    if (fs.existsSync(workingFormerPath) && fs.statSync(workingFormerPath).isDirectory()) {
        console.log('Found working_former_commands directory, loading commands from there as well');
        
        const workingFolders = fs.readdirSync(workingFormerPath).filter(folder => {
            const folderPath = path.join(workingFormerPath, folder);
            return fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory();
        });
        
        for (const folder of workingFolders) {
            await loadCommandsFromFolder(path.join(workingFormerPath, folder), folder);
        }
    }

    console.log(`Loaded ${client.commands.size} commands successfully.`);

    // Print all registered commands for verification
    console.log('Registered commands:');
    client.commands.forEach((cmd, name) => {
        console.log(`- ${name}`);
    });
}

// Helper function to load commands from a specific folder
async function loadCommandsFromFolder(commandsPath: string, category: string) {
    console.log(`Processing folder: ${category}`);
    
    if (!fs.existsSync(commandsPath) || !fs.statSync(commandsPath).isDirectory()) {
        console.warn(`${commandsPath} is not a valid directory, skipping`);
        return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter((file) => {
        return file.endsWith('.js') || file.endsWith('.ts');
    });

    console.log(`Found command files in ${category}: ${commandFiles.join(', ')}`);

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        console.log(`Loading command from: ${filePath}`);

        try {
            // Use dynamic import for ESM
            const commandModule = await import(`file://${filePath}`);

            // Handle both default and named exports
            const command = commandModule.default || commandModule;

            // Add category if missing
            if (command && !command.category) {
                command.category = category;
            }

            // Log the command structure for debugging
            console.log(`Command structure for ${file}:`, {
                hasData: command && 'data' in command, 
                hasExecute: command && 'execute' in command,
                name: command && command.data?.name || 'undefined'
            });

            // Add command to collection
            if (command && 'data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                console.log(`✅ Successfully loaded command: ${command.data.name}`);
            } else {
                console.warn(`⚠️ The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        } catch (error) {
            console.error(`❌ Error loading command from ${filePath}:`, error);
        }
    }
}

// Setup event handlers
async function setupEventHandlers() {
    console.log('Setting up event handlers...');

    // Check both potential event directories
    const eventsPaths = [
        path.join(__dirname, 'events'),
        path.join(process.cwd(), 'events') // Also check root events directory
    ];
    
    let eventsLoaded = 0;
    
    for (const eventsPath of eventsPaths) {
        console.log(`Looking for events in: ${eventsPath}`);

        if (!fs.existsSync(eventsPath)) {
            console.log(`Events directory not found at: ${eventsPath}`);
            continue;
        }

        const eventFiles = fs.readdirSync(eventsPath).filter(file => 
            file.endsWith('.js') || file.endsWith('.ts')
        );

        console.log(`Found event files in ${eventsPath}: ${eventFiles.join(', ')}`);

        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            console.log(`Loading event from: ${filePath}`);

            try {
                // Use dynamic import for ESM
                const eventModule = await import(`file://${filePath}`);

                // Handle both default and named exports
                const event = eventModule.default || eventModule;

                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args));
                    console.log(`✅ Successfully registered once event: ${event.name}`);
                } else {
                    client.on(event.name, (...args) => event.execute(...args));
                    console.log(`✅ Successfully registered on event: ${event.name}`);
                }
                
                eventsLoaded++;
            } catch (error) {
                console.error(`❌ Error loading event from ${filePath}:`, error);
            }
        }
    }

    console.log(`Event handlers loaded successfully: ${eventsLoaded} events registered`);
}

// Main function to initialize the bot
async function initializeBot() {
    console.log('Starting bot initialization...');

    try {
        // Step 1: Load all commands
        await loadCommands();

        // Step 2: Set up event handlers
        await setupEventHandlers();

        // Step 3: Login with the token
        console.log('Logging in to Discord...');
        await client.login(token);

        console.log('✅ Bot initialization complete');
    } catch (error) {
        console.error('❌ Error during bot initialization:', error);
        process.exit(1);
    }
}

// Start the bot
initializeBot();