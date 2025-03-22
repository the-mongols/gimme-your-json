// src/utils/logger.ts
/**
 * Centralized logging utility with log level control
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private static level = LogLevel.INFO;
  
  /**
   * Set the minimum logging level
   */
  static setLevel(level: LogLevel): void {
    Logger.level = level;
  }
  
  /**
   * Log a debug message
   */
  static debug(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.DEBUG) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }
  
  /**
   * Log an info message
   */
  static info(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.INFO) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }
  
  /**
   * Log a warning message
   */
  static warn(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }
  
  /**
   * Log an error message
   */
  static error(message: string, error?: unknown, ...args: any[]): void {
    if (Logger.level <= LogLevel.ERROR) {
      if (error instanceof Error) {
        console.error(`[ERROR] ${message}`, error.stack, ...args);
      } else {
        console.error(`[ERROR] ${message}`, error, ...args);
      }
    }
  }
}