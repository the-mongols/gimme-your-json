// ./src/bot -> Core bot logic for Discord.js 

// Bot initialization

// Import required discord.js classes
import {
    Client, 
    Collection, 
    GatewayIntentBits, 
    Partials, 
    REST
} from 'discord.js';
import type { Interaction, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import fs from 'node:fs'; 
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import Drizzle ORM for Bun


export interface Command {
    category: string;
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// Extend Client type
declare module 'discord.js' {
    export interface Client {
        commands: Collection<string, any>;
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
client.commands = new Collection<string, any>();
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

    const commandFolders = fs.readdirSync(foldersPath);
    console.log(`Found command folders: ${commandFolders.join(', ')}`);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);

        // Skip if not a directory
        if (!fs.existsSync(commandsPath) || !fs.statSync(commandsPath).isDirectory()) {
            console.warn(`${commandsPath} is not a valid directory, skipping`);
            continue;
        }

        console.log(`Processing folder: ${folder}`);

        const commandFiles = fs.readdirSync(commandsPath).filter((file) => {
            return file.endsWith('.js') || file.endsWith('.ts');
        });

        console.log(`Found command files in ${folder}: ${commandFiles.join(', ')}`);

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            console.log(`Loading command from: ${filePath}`);

            try {
                // Use dynamic import for ESM
                const commandModule = await import(`file://${filePath}`);

                // Handle both default and named exports
                const command = commandModule.default || commandModule;

                // Log the command structure for debugging
                console.log(`Command structure for ${file}:`, {
                    hasData: 'data' in command, 
                    hasExecute: 'execute' in command,
                    name: command.data?.name || 'undefined'
                });

                // Add command to collection
                if ('data' in command && 'execute' in command) {
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

    console.log(`Loaded ${client.commands.size} commands successfully.`);

    // Print all registered commands for verification
    console.log('Registered commands:');
    client.commands.forEach((cmd, name) => {
        console.log(`- ${name}`);
    });
}

// Setup event handlers
async function setupEventHandlers() {
    console.log('Setting up event handlers...');

    const eventsPath = path.join(__dirname, 'events');
    console.log(`Looking for events in: ${eventsPath}`);

    if (!fs.existsSync(eventsPath)) {
        console.error(`Events directory not found at: ${eventsPath}`);
        return;
    }

    const eventFiles = fs.readdirSync(eventsPath).filter(file => 
        file.endsWith('.js') || file.endsWith('.ts')
    );

    console.log(`Found event files: ${eventFiles.join(', ')}`);

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
        } catch (error) {
            console.error(`❌ Error loading event from ${filePath}:`, error);
        }
    }

    console.log('Event handlers loaded successfully');
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
