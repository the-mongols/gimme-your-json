// src/utils/logger-init.ts
import { Logger, LogLevel } from './logger.js';

/**
 * Initialize logger configuration based on environment variables
 */
export function initializeLogger(): void {
  // Determine log level from environment variable
  const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
  let logLevel = LogLevel.INFO; // Default to INFO level
  
  if (envLogLevel) {
    switch (envLogLevel) {
      case 'DEBUG':
        logLevel = LogLevel.DEBUG;
        break;
      case 'INFO':
        logLevel = LogLevel.INFO;
        break;
      case 'WARN':
        logLevel = LogLevel.WARN;
        break;
      case 'ERROR':
        logLevel = LogLevel.ERROR;
        break;
      case 'NONE':
        logLevel = LogLevel.NONE;
        break;
    }
  }
  
  // Configure based on environment variables
  Logger.configure({
    level: logLevel,
    includeTimestamp: process.env.LOG_TIMESTAMP !== 'false',
    includeSource: process.env.LOG_SOURCE !== 'false',
    colorize: process.env.LOG_COLOR !== 'false',
    outputToFile: process.env.LOG_TO_FILE === 'true',
    logFilePath: process.env.LOG_FILE_PATH
  });
  
  // Override console methods in development mode unless explicitly disabled
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const shouldOverrideConsole = process.env.OVERRIDE_CONSOLE === 'true' || 
    (isDevelopment && process.env.OVERRIDE_CONSOLE !== 'false');
    
  if (shouldOverrideConsole) {
    Logger.overrideConsole();
    Logger.info('Console logging methods have been overridden by Logger utility');
  }
  
  Logger.info(`Logger initialized at ${Logger.getLevelName(logLevel)} level`);
}

/**
 * Register global exception handlers for better logging
 */
export function registerGlobalErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    Logger.error('Uncaught Exception:', error);
    console.error(error); // Ensure it gets logged even if Logger is broken
    // Give time for logs to be written, then exit
    setTimeout(() => process.exit(1), 500);
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    Logger.error('Unhandled Promise Rejection:', reason);
    console.error('Unhandled Promise Rejection:', reason); // Ensure it gets logged
    // We don't exit here as it's less catastrophic than uncaughtException
  });
  
  Logger.info('Registered global error handlers');
}

/**
 * Initialize all logging components
 */
export function setupLogging(): void {
  initializeLogger();
  registerGlobalErrorHandlers();
}

// Export for direct use
export default setupLogging;