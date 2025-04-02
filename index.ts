// Main application entry point for the Discord bot
import setupLogging from './src/utils/logger-init.js';
import { Logger } from './src/utils/logger.js';
import { initializeBot } from './src/bot/init/index.js';
import { setupScheduler } from './src/scheduler/index.js';
import { initDatabase } from './src/database/init.ts';

// Initialize logging first so all subsequent logs use the configured logger
setupLogging();

async function main() {
  try {
    Logger.info('Starting Discord bot application...');

    // Initialize the database
    await initDatabase();
    
    // Initialize the Discord bot
    await initializeBot();
    
    // Set up scheduled tasks after bot is initialized
    const scheduler = await setupScheduler();
    Logger.info(`Scheduled tasks setup complete. Next update: ${scheduler.nextUpdate.toLocaleString()}`);
    
    Logger.info('Application startup complete');
  } catch (error) {
    Logger.error('Application startup failed:', error);
    process.exit(1);
  }
}

// Start the application
main().catch(error => {
  console.error('Unhandled error in main process:', error);
  process.exit(1);
});