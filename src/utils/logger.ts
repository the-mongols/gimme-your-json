// src/utils/logger.ts
/**
 * Centralized logging utility with log level control and additional features
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4   // No logging
}

interface LoggingOptions {
  includeTimestamp: boolean;
  includeSource: boolean;
  colorize: boolean;
  level: LogLevel;
  outputToFile: boolean;
  logFilePath?: string;
}

interface OriginalConsole {
  log: typeof console.log;
  info: typeof console.info;
  warn: typeof console.warn;
  error: typeof console.error;
}

export class Logger {
  private static level = LogLevel.INFO;
  private static options: LoggingOptions = {
    includeTimestamp: true,
    includeSource: true,
    colorize: true,
    level: LogLevel.INFO,
    outputToFile: false
  };
  
  // Store original console methods to prevent recursion
  private static originalConsole: OriginalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  };
  
  // Track if console is overridden
  private static consoleOverridden = false;
  
  /**
   * Configure logger options
   */
  static configure(options: Partial<LoggingOptions>): void {
    Logger.options = { ...Logger.options, ...options };
    Logger.level = options.level ?? Logger.level;
  }
  
  /**
   * Set the minimum logging level
   */
  static setLevel(level: LogLevel): void {
    Logger.level = level;
  }
  
  /**
   * Get the current logging level
   */
  static getLevel(): LogLevel {
    return Logger.level;
  }
  
  /**
   * Get human-readable log level name
   */
  static getLevelName(level: LogLevel): string {
    return LogLevel[level];
  }
  
  /**
   * Format a log message with optional timestamp and source information
   */
  private static formatLogMessage(level: LogLevel, message: string): string {
    const parts: string[] = [];
    
    // Add timestamp if enabled
    if (Logger.options.includeTimestamp) {
      const now = new Date();
      parts.push(`[${now.toISOString()}]`);
    }
    
    // Add log level
    parts.push(`[${Logger.getLevelName(level)}]`);
    
    // Add source information if enabled
    if (Logger.options.includeSource) {
      try {
        const err = new Error();
        const stack = err.stack || '';
        const stackLines = stack.split('\n');
        
        // Find the calling file (skip this file and the logger method call)
        const callerLine = stackLines.find(line => 
          line.includes('at ') && 
          !line.includes('logger.ts') && 
          !line.includes('src/utils/logger') &&
          !line.includes('new Error') &&
          !line.includes('formatLogMessage')
        );
        
        if (callerLine) {
          // Extract filename and line number
          const match = callerLine.match(/\((.+)\)/) || callerLine.match(/at (.+)/);
          if (match && match[1]) {
            const source = match[1].trim();
            // Only include the filename, not the full path
            const shortSource = source.split('/').slice(-2).join('/');
            parts.push(`[${shortSource}]`);
          }
        }
      } catch (e) {
        // If stack trace parsing fails, just skip source info
      }
    }
    
    // Add message
    parts.push(message);
    
    return parts.join(' ');
  }
  
  /**
   * Log a debug message
   */
  static debug(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.DEBUG) {
      const formattedMessage = Logger.formatLogMessage(LogLevel.DEBUG, message);
      // Use original console.log to prevent recursion
      Logger.originalConsole.log(formattedMessage, ...args);
    }
  }
  
  /**
   * Log an info message
   */
  static info(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.INFO) {
      const formattedMessage = Logger.formatLogMessage(LogLevel.INFO, message);
      // Use original console.log to prevent recursion
      Logger.originalConsole.log(formattedMessage, ...args);
    }
  }
  
  /**
   * Log a warning message
   */
  static warn(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.WARN) {
      const formattedMessage = Logger.formatLogMessage(LogLevel.WARN, message);
      // Use original console.warn to prevent recursion
      Logger.originalConsole.warn(formattedMessage, ...args);
    }
  }
  
  /**
   * Log an error message
   */
  static error(message: string, error?: unknown, ...args: any[]): void {
    if (Logger.level <= LogLevel.ERROR) {
      const formattedMessage = Logger.formatLogMessage(LogLevel.ERROR, message);
      
      if (error instanceof Error) {
        // Use original console.error to prevent recursion
        Logger.originalConsole.error(formattedMessage, error.stack, ...args);
      } else {
        Logger.originalConsole.error(formattedMessage, error, ...args);
      }
    }
  }
  
  /**
   * Create a tagged logger that prepends a tag to all messages
   * Useful for creating loggers for specific components
   */
  static getTaggedLogger(tag: string): {
    debug: (message: string, ...args: any[]) => void;
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, error?: unknown, ...args: any[]) => void;
  } {
    return {
      debug: (message: string, ...args: any[]) => Logger.debug(`[${tag}] ${message}`, ...args),
      info: (message: string, ...args: any[]) => Logger.info(`[${tag}] ${message}`, ...args),
      warn: (message: string, ...args: any[]) => Logger.warn(`[${tag}] ${message}`, ...args),
      error: (message: string, error?: unknown, ...args: any[]) => Logger.error(`[${tag}] ${message}`, error, ...args)
    };
  }
  
  /**
   * Override console.log functions globally to use Logger
   * This should be used with caution as it affects all console.log calls
   * @returns The original console methods for restoration
   */
  static overrideConsole(): OriginalConsole {
    // If already overridden, don't override again
    if (Logger.consoleOverridden) {
      return Logger.originalConsole;
    }
    
    // Save original console methods
    Logger.originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error
    };
    
    // Flag that we've overridden the console
    Logger.consoleOverridden = true;
    
    // Override console methods to use our logger
    console.log = (...args: any[]) => {
      if (Logger.level <= LogLevel.INFO) {
        const message = args[0]?.toString() || '';
        const restArgs = args.slice(1);
        // Use original console to prevent recursion
        const formattedMessage = Logger.formatLogMessage(LogLevel.INFO, message);
        Logger.originalConsole.log(formattedMessage, ...restArgs);
      }
    };
    
    console.info = (...args: any[]) => {
      if (Logger.level <= LogLevel.INFO) {
        const message = args[0]?.toString() || '';
        const restArgs = args.slice(1);
        // Use original console to prevent recursion
        const formattedMessage = Logger.formatLogMessage(LogLevel.INFO, message);
        Logger.originalConsole.info(formattedMessage, ...restArgs);
      }
    };
    
    console.warn = (...args: any[]) => {
      if (Logger.level <= LogLevel.WARN) {
        const message = args[0]?.toString() || '';
        const restArgs = args.slice(1);
        // Use original console to prevent recursion
        const formattedMessage = Logger.formatLogMessage(LogLevel.WARN, message);
        Logger.originalConsole.warn(formattedMessage, ...restArgs);
      }
    };
    
    console.error = (...args: any[]) => {
      if (Logger.level <= LogLevel.ERROR) {
        const message = args[0]?.toString() || '';
        const error = args.length > 1 && args[1] instanceof Error ? args[1] : undefined;
        const restArgs = error ? args.slice(2) : args.slice(1);
        // Use original console to prevent recursion
        const formattedMessage = Logger.formatLogMessage(LogLevel.ERROR, message);
        if (error instanceof Error) {
          Logger.originalConsole.error(formattedMessage, error.stack, ...restArgs);
        } else {
          Logger.originalConsole.error(formattedMessage, error, ...restArgs);
        }
      }
    };
    
    // Return the original console methods in case we need to restore them
    return Logger.originalConsole;
  }
  
  /**
   * Restore original console methods after overriding
   */
  static restoreConsole(): void {
    if (Logger.consoleOverridden) {
      console.log = Logger.originalConsole.log;
      console.info = Logger.originalConsole.info;
      console.warn = Logger.originalConsole.warn;
      console.error = Logger.originalConsole.error;
      Logger.consoleOverridden = false;
    }
  }
}