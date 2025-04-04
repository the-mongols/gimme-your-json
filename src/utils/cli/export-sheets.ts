#!/usr/bin/env bun
import { Logger } from '../../utils/logger.js';
import setupLogging from '../../utils/logger-init.js';
import { initDatabase } from '../../database/init.js';
import { uploadClanDataToSheet, uploadDataToSheets } from '../../services/sheets/client.js';
import { Config } from '../../utils/config.js';
import { getAllClanTags } from '../../config/clans.js';

// Setup logging first
setupLogging();

/**
 * CLI tool for exporting data to Google Sheets
 */
async function main(): Promise<void> {
  try {
    Logger.info('Google Sheets Export CLI');
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    
    // Validate arguments
    const isAllClans = args.includes('--all');
    const clanTag = args.find(a => !a.startsWith('-'));
    
    // Validate clan tag if provided
    if (clanTag && !getAllClanTags().includes(clanTag.toUpperCase())) {
      throw new Error(`Invalid clan tag. Available clans: ${getAllClanTags().join(', ')}`);
    }
    
    // Initialize database
    await initDatabase();
    
    // Validate Google API configuration
    if (!Config.google.sheetId || !Config.google.serviceAccountEmail || !Config.google.privateKey) {
      throw new Error('Google API not configured. Please set the required environment variables.');
    }
    
    // Determine export strategy
    if (isAllClans) {
      Logger.info('Exporting data for all clans to Google Sheets...');
      const result = await uploadDataToSheets();
      
      Logger.info(`Export complete! ${result.totalSuccess} clans exported successfully`);
      
      result.results.forEach(clanResult => {
        Logger.info(`- ${clanResult.clan}: ${clanResult.success ? 'Success' : 'Failed'}`);
      });
    } 
    else if (clanTag) {
      const sheetId = process.env[`GOOGLE_SHEET_ID_${clanTag}`] || Config.google.sheetId;
      
      if (!sheetId) {
        throw new Error(`No Google Sheet ID configured for clan ${clanTag}.`);
      }
      
      Logger.info(`Exporting data for clan ${clanTag} to Google Sheets...`);
      const success = await uploadClanDataToSheet(clanTag, sheetId);
      
      Logger.info(`Export ${success ? 'completed successfully' : 'failed'} for clan ${clanTag}`);
    }
    else {
      // Use default clan
      const defaultClan = Config.defaultClan.tag;
      const sheetId = process.env[`GOOGLE_SHEET_ID_${defaultClan}`] || Config.google.sheetId;
      
      Logger.info(`Exporting data for default clan ${defaultClan} to Google Sheets...`);
      const success = await uploadClanDataToSheet(defaultClan, sheetId);
      
      Logger.info(`Export ${success ? 'completed successfully' : 'failed'} for clan ${defaultClan}`);
    }
    
    process.exit(0);
  } catch (error) {
    Logger.error('Error exporting data to Google Sheets:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error("Unhandled error in main:", error);
  process.exit(1);
});

export default main;