// src/utils/errors.ts
import { Logger } from './logger.js';
import type { ChatInputCommandInteraction } from 'discord.js';

/**
 * Standard error codes for the application
 */
export enum ErrorCode {
  // Database errors
  DB_QUERY_FAILED = 'DB_QUERY_FAILED',
  DB_CONNECTION_ERROR = 'DB_CONNECTION_ERROR',
  DB_CONSTRAINT_VIOLATION = 'DB_CONSTRAINT_VIOLATION',
  
  // API errors
  API_REQUEST_FAILED = 'API_REQUEST_FAILED',
  API_RATE_LIMITED = 'API_RATE_LIMITED',
  API_AUTHENTICATION_FAILED = 'API_AUTHENTICATION_FAILED',
  API_BAD_RESPONSE = 'API_BAD_RESPONSE',
  
  // Command errors
  COMMAND_EXECUTION_FAILED = 'COMMAND_EXECUTION_FAILED',
  COMMAND_INVALID_ARGUMENTS = 'COMMAND_INVALID_ARGUMENTS',
  COMMAND_PERMISSION_DENIED = 'COMMAND_PERMISSION_DENIED',
  
  // Clan related errors
  CLAN_NOT_FOUND = 'CLAN_NOT_FOUND',
  CLAN_API_ERROR = 'CLAN_API_ERROR',
  
  // Player related errors
  PLAYER_NOT_FOUND = 'PLAYER_NOT_FOUND',
  PLAYER_ALREADY_EXISTS = 'PLAYER_ALREADY_EXISTS',
  PLAYER_DATA_FETCH_FAILED = 'PLAYER_DATA_FETCH_FAILED',
  
  // Config errors
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_MISSING_VALUE = 'CONFIG_MISSING_VALUE',
  
  // Other errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  TIMEOUT = 'TIMEOUT',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_INVALID_FORMAT = 'FILE_INVALID_FORMAT'
}

/**
 * Standard application error with code and user-friendly message
 */
export class BotError extends Error {
  /**
   * Create a new bot error
   * @param message Technical error message for logging
   * @param code Error code for categorizing the error
   * @param userMessage User-friendly message to show in Discord (defaults to technical message)
   */
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly userMessage: string = message
  ) {
    super(message);
    this.name = 'BotError';
  }
}

/**
 * Handle an error from a command execution
 * @param interaction Discord interaction that triggered the error
 * @param error The error that occurred
 * @param ephemeral Whether the error response should be ephemeral (private)
 */
export async function handleCommandError(
  interaction: ChatInputCommandInteraction, 
  error: unknown,
  ephemeral: boolean = true
): Promise<void> {
  // If interaction was already replied to or deferred, use followUp
  const replyMethod = interaction.replied || interaction.deferred
    ? interaction.followUp.bind(interaction)
    : interaction.reply.bind(interaction);
  
  if (error instanceof BotError) {
    Logger.error(`${error.code}: ${error.message}`);
    
    await replyMethod({
      content: `Error: ${error.userMessage}`,
      ephemeral
    });
    return;
  }
  
  // For other errors
  Logger.error('Unexpected error during command execution:', error);
  
  const errorMessage = error instanceof Error 
    ? error.message 
    : 'An unknown error occurred';
  
  try {
    await replyMethod({
      content: `An error occurred: ${errorMessage}`,
      ephemeral
    });
  } catch (replyError) {
    Logger.error('Failed to send error message:', replyError);
  }
}

/**
 * Standard error handler for async functions
 * Logs the error and returns a BotError
 * @param operation Operation description for the error message
 * @param error The caught error object
 * @param code Error code to use
 * @param userMessage Optional user-friendly message
 * @returns A BotError with the appropriate message and code
 */
export function handleError(
  operation: string,
  error: unknown,
  code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
  userMessage?: string
): BotError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const fullMessage = `${operation}: ${errorMessage}`;
  
  Logger.error(fullMessage, error);
  
  return new BotError(
    fullMessage,
    code,
    userMessage || `Failed to ${operation.toLowerCase()}`
  );
}

/**
 * Create a database error
 * @param message Error message
 * @param userMessage Optional user-friendly message
 * @returns BotError with database error code
 */
export function createDatabaseError(message: string, userMessage?: string): BotError {
  return new BotError(
    message,
    ErrorCode.DB_QUERY_FAILED,
    userMessage || 'A database error occurred'
  );
}

/**
 * Create an API error
 * @param message Error message
 * @param userMessage Optional user-friendly message
 * @returns BotError with API error code
 */
export function createApiError(message: string, userMessage?: string): BotError {
  return new BotError(
    message,
    ErrorCode.API_REQUEST_FAILED,
    userMessage || 'An API error occurred'
  );
}

/**
 * Create a clan not found error
 * @param clanTag Clan tag that wasn't found
 * @returns BotError with clan not found error code
 */
export function createClanNotFoundError(clanTag: string): BotError {
  return new BotError(
    `Clan with tag "${clanTag}" not found in configuration`,
    ErrorCode.CLAN_NOT_FOUND,
    `Clan "${clanTag}" not found. Please check the clan tag or use a different clan.`
  );
}

/**
 * Create a player not found error
 * @param identifier Player identifier (name, ID, etc.)
 * @param clanTag Optional clan tag context
 * @returns BotError with player not found error code
 */
export function createPlayerNotFoundError(identifier: string, clanTag?: string): BotError {
  const contextMsg = clanTag ? ` in clan ${clanTag}` : '';
  return new BotError(
    `Player "${identifier}" not found${contextMsg}`,
    ErrorCode.PLAYER_NOT_FOUND,
    `Player "${identifier}" not found${contextMsg}. Please check the identifier or add the player first.`
  );
}

/**
 * Create a command execution error
 * @param commandName Name of the command that failed
 * @param error The underlying error
 * @returns BotError with command execution failed code
 */
export function createCommandError(commandName: string, error: unknown): BotError {
  const message = error instanceof Error ? error.message : String(error);
  return new BotError(
    `Error executing command ${commandName}: ${message}`,
    ErrorCode.COMMAND_EXECUTION_FAILED,
    `There was an error while executing the ${commandName} command`
  );
}

/**
 * Create a permission denied error
 * @param permission The permission that was missing
 * @returns BotError with permission denied code
 */
export function createPermissionError(permission: string): BotError {
  return new BotError(
    `Missing permission: ${permission}`,
    ErrorCode.COMMAND_PERMISSION_DENIED,
    `You don't have the required permission: ${permission}`
  );
}