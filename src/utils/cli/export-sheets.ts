#!/usr/bin/env bun
console.log("EXPORT-SHEETS SCRIPT STARTING - VERSION 4");

// Import the necessary modules
import { Logger } from '../../utils/logger.js';
import setupLogging from '../../utils/logger-init.js';
import { initDatabase } from '../../database/init.js';
import { uploadClanDataToSheet, uploadDataToSheets } from '../../services/sheets/client.js';
import { Config } from '../../utils/config.js';

// Setup logging first
setupLogging();

/**
 * CLI tool for exporting data to Google Sheets
 */
async function main() {
  console.log("MAIN FUNCTION STARTED");
  const args = process.argv.slice(2);
  console.log("Command arguments:", args);
  
  const isAllClans = args.includes('--all');
  const clanTag = args.find(a => !a.startsWith('-'));
  
  Logger.info('Google Sheets Export CLI');
  console.log("DEBUG: Running with parameters - isAllClans:", isAllClans, "clanTag:", clanTag);
  
  try {
    // Initialize database
    console.log("DEBUG: Starting database initialization");
    await initDatabase();
    console.log("DEBUG: Database initialization complete");
    
    // Check if Google API is configured
    console.log("DEBUG: Checking Google API config");
    console.log("DEBUG: Sheet ID:", Config.google.sheetId || "NOT SET");
    console.log("DEBUG: Service Account Email:", Config.google.serviceAccountEmail ? "SET" : "NOT SET");
    console.log("DEBUG: Private Key:", Config.google.privateKey ? `SET (length: ${Config.google.privateKey?.length || 0})` : "NOT SET");
    
    if (!Config.google.sheetId || !Config.google.serviceAccountEmail || !Config.google.privateKey) {
      console.error("ERROR: Google API not configured. Please set the required environment variables.");
      throw new Error('Google API not configured. Please set the required environment variables.');
    }
    
    console.log("DEBUG: All Google API credentials are present, proceeding with export");
    
    // Determine what to export
    if (isAllClans) {
      console.log("DEBUG: Exporting data for all clans");
      Logger.info('Exporting data for all clans to Google Sheets...');
      const result = await uploadDataToSheets();
      
      Logger.info(`Export complete! ${result.totalSuccess} clans exported successfully`);
      
      result.results.forEach(clanResult => {
        Logger.info(`- ${clanResult.clan}: ${clanResult.success ? 'Success' : 'Failed'}`);
      });
    } 
    else if (clanTag) {
      console.log(`DEBUG: Exporting data for clan ${clanTag}`);
      // Get clan-specific sheet ID if available, or fallback to default
      const sheetId = process.env[`GOOGLE_SHEET_ID_${clanTag}`] || Config.google.sheetId;
      console.log(`DEBUG: Using sheet ID: ${sheetId}`);
      
      if (!sheetId) {
        console.error(`ERROR: No Google Sheet ID available for clan ${clanTag}`);
        throw new Error(`No Google Sheet ID configured for clan ${clanTag}.`);
      }
      
      Logger.info(`Exporting data for clan ${clanTag} to Google Sheets...`);
      console.log("DEBUG: About to call uploadClanDataToSheet");
      
      try {
        const success = await uploadClanDataToSheet(clanTag, sheetId);
        console.log(`DEBUG: uploadClanDataToSheet returned: ${success}`);
        Logger.info(`Export ${success ? 'completed successfully' : 'failed'} for clan ${clanTag}`);
      } catch (exportError) {
        console.error("DEBUG: Export operation threw an error:", exportError);
        throw exportError;
      }
    }
    else {
      console.log("DEBUG: No clan specified, using default clan");
      // Use default clan
      const sheetId = process.env[`GOOGLE_SHEET_ID_${Config.defaultClan.tag}`] || Config.google.sheetId;
      console.log(`DEBUG: Using default clan ${Config.defaultClan.tag} with sheet ID: ${sheetId}`);
      
      Logger.info(`Exporting data for default clan ${Config.defaultClan.tag} to Google Sheets...`);
      const success = await uploadClanDataToSheet(Config.defaultClan.tag, sheetId);
      
      Logger.info(`Export ${success ? 'completed successfully' : 'failed'} for clan ${Config.defaultClan.tag}`);
    }
    
    console.log("DEBUG: Export process completed");
    process.exit(0);
  } catch (error) {
    Logger.error('Error exporting data to Google Sheets:', error);
    console.error("FATAL ERROR:", error);
    process.exit(1);
  }
}

// Always run the main function directly
console.log("CALLING MAIN FUNCTION DIRECTLY");
main().catch(error => {
  console.error("Unhandled error in main:", error);
  process.exit(1);
});

export default main;