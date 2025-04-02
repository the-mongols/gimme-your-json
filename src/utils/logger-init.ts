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
  
  Logger.info(`Logger initialized at ${Logger.getLevelName(logLevel)} level`);
  
  // Override console methods in development mode unless explicitly disabled
  // This should happen AFTER initial logger setup to avoid recursion issues
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const shouldOverrideConsole = process.env.OVERRIDE_CONSOLE === 'true' || 
    (isDevelopment && process.env.OVERRIDE_CONSOLE !== 'false');
    
  if (shouldOverrideConsole) {
    Logger.overrideConsole();
    Logger.info('Console logging methods have been overridden by Logger utility');
  }
}

/**
 * Register global exception handlers for better logging
 */
export function registerGlobalErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    Logger.error('Uncaught Exception:', error);
    // Give time for logs to be written, then exit
    setTimeout(() => process.exit(1), 500);
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    Logger.error('Unhandled Promise Rejection:', reason);
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