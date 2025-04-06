#!/usr/bin/env bun
// src/utils/cli/google-sheets-debug.ts
import { Logger } from '../../utils/logger.js';
import setupLogging from '../../utils/logger-init.js';
import { Config } from '../../utils/config.js';
import crypto from 'crypto';

// Setup logging
setupLogging();

// Set logger to debug level for more verbose output
Logger.setLevel(0); // DEBUG level

console.log("Starting Google Sheets debug test...");
console.log("Current environment:", process.env.NODE_ENV);

/**
 * Generate a JWT token for Google Sheets API authentication
 */
async function generateJWT(email: string, privateKey: string): Promise<string> {
  try {
    console.log("Generating JWT with email:", email);
    console.log("Private key first 50 chars:", privateKey.substring(0, 50));
    
    // Check if the private key format is correct
    if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
      console.error("ERROR: Private key does not have the correct format!");
      console.error("It should start with -----BEGIN PRIVATE KEY-----");
      console.error("Please check your .env file and make sure newlines are preserved correctly");
    }
    
    // Current timestamp
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600; // Token valid for 1 hour

    // JWT Header
    const header = {
      alg: "RS256",
      typ: "JWT"
    };

    // JWT Payload
    const payload = {
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: expiry,
      iat: now
    };

    console.log("JWT payload created with expiry:", new Date(expiry * 1000).toISOString());
    console.log("JWT payload:", JSON.stringify(payload));

    // Encode header and payload
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    // Create signing input
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    // Sign the input with the private key
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    sign.end();
    
    console.log("Signing JWT...");
    
    try {
      const signature = sign.sign(privateKey);
      const encodedSignature = signature.toString('base64url');
      
      // Return the JWT
      const jwt = `${signingInput}.${encodedSignature}`;
      console.log("JWT generated successfully. Length:", jwt.length);
      console.log("JWT first 20 chars:", jwt.substring(0, 20) + "...");
      return jwt;
    } catch (signError) {
      console.error("Error during JWT signing:", signError);
      throw signError;
    }
  } catch (error) {
    console.error('Error generating JWT:', error);
    throw error;
  }
}

/**
 * Get an access token from Google OAuth service using JWT
 */
async function getAccessToken(jwt: string): Promise<string> {
  try {
    console.log("Getting access token with JWT...");
    
    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    });
    
    console.log("OAuth request parameters:", params.toString().substring(0, 50) + "...");
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    console.log("OAuth response status:", response.status);
    // Convert Headers to an object safely
    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });
    console.log("OAuth response headers:", JSON.stringify(headersObj, null, 2));
    
    const responseText = await response.text();
    console.log("OAuth response body:", responseText);
    
    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.status} ${responseText}`);
    }

    const data = JSON.parse(responseText);
    console.log("Access token received. Token type:", data.token_type);
    console.log("Access token first 20 chars:", data.access_token.substring(0, 20) + "...");
    console.log("Token expires in:", data.expires_in, "seconds");
    return data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error);
    throw error;
  }
}

/**
 * Test the sheet metadata endpoint first to check permissions
 */
async function checkSheetMetadata(sheetId: string, accessToken: string): Promise<boolean> {
  try {
    console.log(`Fetching metadata for sheet ID: ${sheetId}`);
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    console.log("Metadata API response status:", response.status);
    
    const responseText = await response.text();
    console.log("Metadata API response:", responseText);
    
    if (!response.ok) {
      console.error(`Failed to get sheet metadata: ${response.status}`);
      return false;
    }
    
    const data = JSON.parse(responseText);
    console.log("Sheet title:", data.properties?.title);
    return true;
  } catch (error) {
    console.error("Error checking sheet metadata:", error);
    return false;
  }
}

/**
 * Detailed test function to diagnose Google Sheets API issues
 */
async function debugGoogleSheetsAPI() {
  console.log('Starting Google Sheets API Debug Test');
  
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
    
    // Generate JWT
    console.log("Step 1: Generating JWT...");
    const jwt = await generateJWT(
      Config.google.serviceAccountEmail,
      Config.google.privateKey
    );
    
    // Get access token
    console.log("\nStep 2: Getting access token...");
    const accessToken = await getAccessToken(jwt);
    
    // Check if we can access the sheet metadata first
    console.log("\nStep 3: Checking sheet access permissions...");
    const hasAccess = await checkSheetMetadata(Config.google.sheetId, accessToken);
    
    if (!hasAccess) {
      console.error("Cannot access the spreadsheet. Possible issues:");
      console.error("1. The spreadsheet does not exist");
      console.error("2. The service account does not have permission to access the spreadsheet");
      console.error("3. The sheet ID is incorrect");
      console.error("\nPlease ensure you have shared the spreadsheet with the service account email:");
      console.error(Config.google.serviceAccountEmail);
      return false;
    }
    
    // Test data
    const testData = [
      ['Debug Test ID', 'Debug Test Name', 'Timestamp'],
      ['1', 'API Debug Test', new Date().toISOString()]
    ];
    
    // Upload test data
    const sheetId = Config.google.sheetId;
    // Use a specific sheet name if you know it, or Sheet1 by default
    const range = 'Sheet1!A1:C2';
    
    console.log(`\nStep 4: Making API request to update Google Sheet...`);
    console.log(`Sheet ID: ${sheetId}`);
    console.log(`Range: ${range}`);
    console.log(`Data: ${JSON.stringify(testData)}`);
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: testData
        })
      }
    );
    
    console.log("Sheets API response status:", response.status);
    // Convert Headers to an object safely
    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });
    console.log("Sheets API response headers:", JSON.stringify(headersObj, null, 2));
    
    const responseText = await response.text();
    console.log("Sheets API response body:", responseText);
    
    if (!response.ok) {
      console.error(`Google Sheets API error: ${response.status}`);
      console.error(`Response: ${responseText}`);
      return false;
    }
    
    const result = JSON.parse(responseText);
    console.log("\nTest Results:");
    console.log("✅ Google Sheets API Test Successful!");
    console.log(`Updated cells: ${result.updatedCells}`);
    console.log(`Updated range: ${result.updatedRange}`);
    console.log(`Updated rows: ${result.updatedRows}`);
    console.log(`Updated columns: ${result.updatedColumns}`);
    
    return true;
  } catch (error) {
    console.error('Google Sheets API Test Failed with error:', error);
    return false;
  }
}

// Run the test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Starting Google Sheets debug test...");
  debugGoogleSheetsAPI()
    .then(success => {
      console.log("\nTest completed with result:", success ? "SUCCESS" : "FAILURE");
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('\nUnhandled error during test:', error);
      process.exit(1);
    });
}

export default debugGoogleSheetsAPI;