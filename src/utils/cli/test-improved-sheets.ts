#!/usr/bin/env bun
// src/utils/cli/test-improved-sheets.ts
import { Logger } from '../../utils/logger.js';
import setupLogging from '../../utils/logger-init.js';
import { Config } from '../../utils/config.js';
// Use the existing client for testing instead of the improved client
import * as ImprovedClient from '../../services/sheets/client.js';

// Setup logging with DEBUG level
setupLogging();
Logger.setLevel(0); // DEBUG level

console.log("Starting Improved Google Sheets Client Test...");
console.log("Environment:", process.env.NODE_ENV);

/**
 * Test function for the improved Google Sheets client
 */
async function testImprovedSheetsClient() {
  console.log('\n========== IMPROVED GOOGLE SHEETS CLIENT TEST ==========\n');
  
  try {
    // Check if Google API is configured
    console.log("Checking Google API configuration...");
    console.log("Sheet ID:", Config.google.sheetId);
    console.log("Service account email:", Config.google.serviceAccountEmail);
    console.log("Private key length:", Config.google.privateKey?.length || 0);
    
    if (!Config.google.sheetId || !Config.google.serviceAccountEmail || !Config.google.privateKey) {
      console.error('Google API not configured. Please check your environment variables:');
      console.error('Required: GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY');
      return false;
    }
    
    // Create simple test data
    const testData = [
      ['Test ID', 'Test Name', 'Timestamp'],
      ['1', 'Improved Sheet Client Test', new Date().toLocaleString()]
    ];
    
    // Try uploading to Sheet1 first
    const sheetName = 'Sheet1';
    console.log(`\nTest 1: Uploading data to sheet "${sheetName}" with improved client...`);
    
    try {
      const result = await ImprovedClient.uploadToSheet(
        Config.google.sheetId,
        sheetName,
        testData
      );
      
      console.log("Success! Response:");
      console.log(`- Updated range: ${result.updatedRange}`);
      console.log(`- Updated cells: ${result.updatedCells}`);
      console.log(`- Updated rows: ${result.updatedRows}`);
      console.log(`- Updated columns: ${result.updatedColumns}`);
    } catch (error) {
      console.error("Failed to update sheet:", error);
      
      // If it failed, try with a clan tag as the sheet name
      const clanTag = Object.values(Config.clans)[0]?.tag || 'PN31';
      console.log(`\nTest 2: Sheet1 failed, trying with clan tag "${clanTag}" as sheet name...`);
      
      try {
        const result = await ImprovedClient.uploadToSheet(
          Config.google.sheetId,
          clanTag,
          testData
        );
        
        console.log("Success with clan tag sheet! Response:");
        console.log(`- Updated range: ${result.updatedRange}`);
        console.log(`- Updated cells: ${result.updatedCells}`);
        console.log(`- Updated rows: ${result.updatedRows}`);
        console.log(`- Updated columns: ${result.updatedColumns}`);
      } catch (error) {
        console.error("Failed with clan tag sheet as well:", error);
        return false;
      }
    }
    
    // Test the range update method
    console.log("\nTest 3: Updating a specific range...");
    
    const rangeTestData = [
      ['Range ID', 'Range Test Name', 'Range Test Timestamp'],
      ['2', 'Range Update Test', new Date().toLocaleString()]
    ];
    
    try {
      // Try to update from row 10
      const result = await ImprovedClient.uploadToRangeInSheet(
        Config.google.sheetId,
        sheetName,  // Use the same sheet name that worked above
        10,  // Start at row 10
        rangeTestData
      );
      
      console.log("Range update success! Response:");
      console.log(`- Updated range: ${result.updatedRange}`);
      console.log(`- Updated cells: ${result.updatedCells}`);
      console.log(`- Updated rows: ${result.updatedRows}`);
      console.log(`- Updated columns: ${result.updatedColumns}`);
    } catch (error) {
      console.error("Failed to update range:", error);
      return false;
    }
    
    console.log("\nAll tests completed successfully!");
    return true;
  } catch (error) {
    console.error('Test failed with error:', error);
    return false;
  }
}

// Run the test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Starting improved Google Sheets client test...");
  testImprovedSheetsClient()
    .then(success => {
      console.log("\nTest completed with result:", success ? "SUCCESS" : "FAILURE");
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('\nUnhandled error during test:', error);
      process.exit(1);
    });
}

export default testImprovedSheetsClient;