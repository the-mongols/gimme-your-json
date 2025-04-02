#!/usr/bin/env bun
// src/utils/cli/export-sheets.ts
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
  const args = process.argv.slice(2);
  const isAllClans = args.includes('--all');
  const clanTag = args.find(a => !a.startsWith('-'));
  
  Logger.info('Google Sheets Export CLI');
  
  try {
    // Initialize database
    await initDatabase();
    
    // Check if Google API is configured
    if (!Config.google.sheetId || !Config.google.serviceAccountEmail || !Config.google.privateKey) {
      throw new Error('Google API not configured. Please set the required environment variables.');
    }
    
    // Determine what to export
    if (isAllClans) {
      Logger.info('Exporting data for all clans to Google Sheets...');
      const result = await uploadDataToSheets();
      
      Logger.info(`Export complete! ${result.totalSuccess} clans exported successfully`);
      
      result.results.forEach(clanResult => {
        Logger.info(`- ${clanResult.clan}: ${clanResult.success ? 'Success' : 'Failed'}`);
      });
    } 
    else if (clanTag) {
      // Get clan-specific sheet ID if available, or fallback to default
      const sheetId = process.env[`GOOGLE_SHEET_ID_${clanTag}`] || Config.google.sheetId;
      
      Logger.info(`Exporting data for clan ${clanTag} to Google Sheets...`);
      const success = await uploadClanDataToSheet(clanTag, sheetId);
      
      Logger.info(`Export ${success ? 'completed successfully' : 'failed'} for clan ${clanTag}`);
    }
    else {
      // Use default clan
      const sheetId = process.env[`GOOGLE_SHEET_ID_${Config.defaultClan.tag}`] || Config.google.sheetId;
      
      Logger.info(`Exporting data for default clan ${Config.defaultClan.tag} to Google Sheets...`);
      const success = await uploadClanDataToSheet(Config.defaultClan.tag, sheetId);
      
      Logger.info(`Export ${success ? 'completed successfully' : 'failed'} for clan ${Config.defaultClan.tag}`);
    }
    
    process.exit(0);
  } catch (error) {
    Logger.error('Error exporting data to Google Sheets:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;