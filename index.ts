// Main application entry point for the Discord bot
import { Logger } from './src/utils/logger.js';
import initializeBot from './src/bot/init/index.js';
import { setupScheduler } from './src/scheduler/index.js';

Logger.info('Starting Discord bot application...');

// Run the initialization process
initializeBot()
  .then(() => {
    // Import and initialize the bot after database setup
    import('./src/bot/bot.js')
      .then(() => {
        Logger.info('Bot started successfully');
        
        // Set up scheduled tasks
        return setupScheduler();
      })
      .then((scheduler) => {
        Logger.info(`Scheduled tasks setup complete. Next update: ${scheduler.nextUpdate.toLocaleString()}`);
      })
      .catch((error: Error) => {
        Logger.error('Error starting bot:', error);
        process.exit(1);
      });
  })
  .catch((error: Error) => {
    Logger.error('Initialization failed:', error);
    process.exit(1);
  });