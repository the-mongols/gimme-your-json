#!/usr/bin/env bun
// src/utils/cli/check-sheets-config.ts
import { Logger } from '../../utils/logger.js';
import setupLogging from '../../utils/logger-init.js';
import { Config } from '../../utils/config.js';
import { getAllClanTags } from '../../config/clans.js';

// Setup logging
setupLogging();

// Debug console log (direct to make sure it shows up)
console.log("Starting Google Sheets config check...");
console.log("Current environment:", process.env.NODE_ENV);

/**
 * Check if Google Sheets API credentials are properly configured
 */
function checkGoogleSheetsConfig() {
  Logger.info('Checking Google Sheets API Configuration');
  
  let hasErrors = false;
  
  // Output direct console logs to ensure we see something
  console.log("Checking GOOGLE_SERVICE_ACCOUNT_EMAIL...");
  console.log(`  Is defined: ${Boolean(Config.google.serviceAccountEmail)}`);
  
  // Check service account email
  if (!Config.google.serviceAccountEmail) {
    Logger.error('❌ Missing GOOGLE_SERVICE_ACCOUNT_EMAIL environment variable');
    hasErrors = true;
  } else {
    Logger.info('✅ GOOGLE_SERVICE_ACCOUNT_EMAIL is configured');
    console.log(`  Value: ${Config.google.serviceAccountEmail.substring(0, 5)}...`);
  }
  
  // Check private key
  console.log("Checking GOOGLE_PRIVATE_KEY...");
  console.log(`  Is defined: ${Boolean(Config.google.privateKey)}`);
  
  if (!Config.google.privateKey) {
    Logger.error('❌ Missing GOOGLE_PRIVATE_KEY environment variable');
    hasErrors = true;
  } else {
    Logger.info('✅ GOOGLE_PRIVATE_KEY is configured');
    
    // Output first few characters
    console.log(`  First few chars: ${Config.google.privateKey.substring(0, 15)}...`);
    
    // Check for common private key formatting issues
    if (!Config.google.privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      Logger.warn('⚠️ Private key may be incorrectly formatted. Should start with "-----BEGIN PRIVATE KEY-----"');
      Logger.warn('   Make sure newlines are preserved correctly. You might need to use quotes in your .env file.');
    }
  }
  
  // Check default sheet ID
  console.log("Checking GOOGLE_SHEET_ID...");
  console.log(`  Is defined: ${Boolean(Config.google.sheetId)}`);
  
  if (!Config.google.sheetId) {
    Logger.warn('⚠️ Missing GOOGLE_SHEET_ID environment variable');
    hasErrors = true;
  } else {
    Logger.info('✅ GOOGLE_SHEET_ID is configured');
    console.log(`  Value: ${Config.google.sheetId.substring(0, 10)}...`);
  }
  
  // Check clan-specific sheet IDs
  const clans = getAllClanTags();
  Logger.info(`Checking clan-specific sheet IDs for ${clans.length} clans:`);
  console.log(`Total clans found: ${clans.length}`);
  
  let configuredClans = 0;
  for (const clan of clans) {
    const sheetId = process.env[`GOOGLE_SHEET_ID_${clan}`];
    if (sheetId) {
      Logger.info(`✅ ${clan}: Has specific sheet ID configured`);
      configuredClans++;
    } else if (Config.google.sheetId) {
      Logger.info(`ℹ️ ${clan}: Using default sheet ID`);
    } else {
      Logger.warn(`⚠️ ${clan}: No sheet ID available (default or specific)`);
    }
  }
  
  // Summary
  console.log("\nSummary:");
  console.log(`  Required config present: ${!hasErrors}`);
  console.log(`  Clans with specific IDs: ${configuredClans}`);
  
  if (hasErrors) {
    Logger.error('❌ Required Google Sheets API configuration is incomplete');
    return false;
  } else {
    Logger.info('✅ Google Sheets API configuration looks good');
    Logger.info(`ℹ️ ${configuredClans} clans have specific sheet IDs, ${clans.length - configuredClans} use default sheet ID`);
    return true;
  }
}

// Run the check if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Main check function starting...");
  try {
    const success = checkGoogleSheetsConfig();
    console.log("Check completed with result:", success);
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error("Error during check:", error);
    process.exit(1);
  }
}

export default checkGoogleSheetsConfig;