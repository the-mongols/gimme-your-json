#!/usr/bin/env bun
// src/utils/cli/export-sheets-cli.ts
import { Logger } from '../../utils/logger.js';
import setupLogging from '../../utils/logger-init.js';
import { initDatabase } from '../../database/init.js';
import { uploadClanDataToSheet, uploadDataToSheets } from '../../services/sheets/client.js';
import { Config } from '../../utils/config.js';
import { getAllClanTags } from '../../config/clans.js';

// Setup logging
setupLogging();

/**
 * CLI tool for exporting data to Google Sheets
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const help = args.includes('--help') || args.includes('-h');
    const isAllClans = args.includes('--all') || args.includes('-a');
    const isVerbose = args.includes('--verbose') || args.includes('-v');
    
    if (isVerbose) {
      Logger.setLevel(0); // DEBUG level
    }
    
    // Show help text
    if (help) {
      console.log(`
Google Sheets Export CLI Utility
================================

Usage:
  bun run export-sheets-cli.ts [options] [clan]

Options:
  --help, -h     Show this help text
  --all, -a      Export data for all clans
  --verbose, -v  Enable verbose logging
  
Arguments:
  clan           Clan tag to export data for (e.g., PN31, PN30)
                 If omitted, uses default clan: ${Config.defaultClan.tag}

Examples:
  bun run export-sheets-cli.ts                # Export default clan data
  bun run export-sheets-cli.ts PN31           # Export PN31 clan data
  bun run export-sheets-cli.ts --all          # Export all clans data
  bun run export-sheets-cli.ts --verbose PN30 # Export PN30 data with verbose logging
`);
      return;
    }
    
    // Get clan tag from arguments if provided
    let clanTag: string | null = null;
    for (const arg of args) {
      if (!arg.startsWith('-') && getAllClanTags().includes(arg.toUpperCase())) {
        clanTag = arg.toUpperCase();
        break;
      }
    }
    
    if (!clanTag && !isAllClans) {
      clanTag = Config.defaultClan.tag;
    }
    
    Logger.info('Google Sheets Export CLI Utility');
    Logger.info(`Running with ${isVerbose ? 'verbose' : 'standard'} logging`);
    
    // Check configuration
    if (!Config.google.sheetId || !Config.google.serviceAccountEmail || !Config.google.privateKey) {
      Logger.error('Google API not configured. Please check your environment variables:');
      Logger.error('Required: GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY');
      process.exit(1);
    }
    
    // Initialize database
    await initDatabase();
    
    // Perform export
    if (isAllClans) {
      Logger.info('Exporting data for all clans to Google Sheets...');
      const startTime = Date.now();
      
      const result = await uploadDataToSheets();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      Logger.info(`Export completed in ${duration}s - ${result.totalSuccess} of ${result.results.length} clans exported successfully`);
      
      // Show details for each clan
      for (const clanResult of result.results) {
        const statusSymbol = clanResult.success ? '✅' : '❌';
        Logger.info(`${statusSymbol} ${clanResult.clan}: ${clanResult.success ? 'Success' : 'Failed'}`);
      }
      
      // Overall success/failure status
      if (result.totalSuccess === result.results.length) {
        Logger.info('All clans exported successfully!');
      } else if (result.totalSuccess === 0) {
        Logger.error('Export failed for all clans!');
        process.exit(1);
      } else {
        Logger.warn(`Export partially successful (${result.totalSuccess}/${result.results.length} clans)`);
      }
    } 
    else if (clanTag) {
      // Get spreadsheet ID - use clan-specific if available, otherwise default
      const sheetId = process.env[`GOOGLE_SHEET_ID_${clanTag}`] || Config.google.sheetId;
      
      if (!sheetId) {
        Logger.error(`No Google Sheet ID configured for clan ${clanTag}.`);
        process.exit(1);
      }
      
      Logger.info(`Exporting data for clan ${clanTag} to Google Sheets...`);
      const startTime = Date.now();
      
      try {
        const success = await uploadClanDataToSheet(clanTag, sheetId);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        if (success) {
          Logger.info(`Export completed successfully in ${duration}s for clan ${clanTag}!`);
        } else {
          Logger.error(`Export failed for clan ${clanTag} after ${duration}s.`);
          process.exit(1);
        }
      } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        Logger.error(`Export failed for clan ${clanTag} after ${duration}s: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    } else {
      Logger.error('No clan specified. Use --all to export all clans or specify a clan tag.');
      Logger.error('Available clans: ' + getAllClanTags().join(', '));
      process.exit(1);
    }
  } catch (error) {
    Logger.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Run the tool if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export default main;