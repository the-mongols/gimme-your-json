// ./src/bot/events -> Discord event listeners 

// Event loader 

// src/bot/events/index.ts

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'discord.js';
import { Logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Loads all event handlers from the events directory
 * @param client Discord.js client instance
 */
export async function loadEvents(client: Client): Promise<number> {
  const eventsDir = path.join(__dirname);
  Logger.info(`Loading events from: ${eventsDir}`);
  
  let loadedCount = 0;

  // Read all files in the events directory
  const eventFiles = fs.readdirSync(eventsDir).filter(file => 
    (file.endsWith('.js') || file.endsWith('.ts')) && 
    file !== 'index.ts' && 
    file !== 'index.js'
  );

  Logger.info(`Found ${eventFiles.length} event files`);

  for (const file of eventFiles) {
    const filePath = path.join(eventsDir, file);
    
    try {
      // Use dynamic import for ESM
      const eventModule = await import(`file://${filePath}`);
      
      // Handle both default and named exports
      const event = eventModule.default || eventModule;
      
      if (!event.name || !event.execute) {
        Logger.warn(`Event file ${file} is missing required name or execute property`);
        continue;
      }

      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
        Logger.debug(`Registered one-time event: ${event.name}`);
      } else {
        client.on(event.name, (...args) => event.execute(...args));
        Logger.debug(`Registered event: ${event.name}`);
      }
      
      loadedCount++;
    } catch (error) {
      Logger.error(`Error loading event from ${filePath}`, error);
    }
  }

  Logger.info(`Successfully loaded ${loadedCount} events`);
  return loadedCount;
}