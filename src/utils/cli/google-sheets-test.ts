#!/usr/bin/env bun
// src/utils/cli/google-sheets-test.ts
import { Logger } from '../../utils/logger.js';
import setupLogging from '../../utils/logger-init.js';
import { Config } from '../../utils/config.js';
import crypto from 'crypto';

// Setup logging
setupLogging();

// Debug logs
console.log("Starting Google Sheets test script...");
console.log("Current environment:", process.env.NODE_ENV);

/**
 * Generate a JWT token for Google Sheets API authentication
 * @param email Service account email
 * @param privateKey Private key for signing
 * @returns JWT token
 */
async function generateJWT(email: string, privateKey: string): Promise<string> {
  try {
    console.log("Generating JWT with email:", email);
    
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
 * @param jwt JWT token
 * @returns Access token
 */
async function getAccessToken(jwt: string): Promise<string> {
  try {
    console.log("Getting access token with JWT...");
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    console.log("OAuth response status:", response.status);
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error("OAuth error response:", errorData);
      throw new Error(`Failed to get access token: ${response.status} ${errorData}`);
    }

    const data = await response.json();
    console.log("Access token received. Token type:", data.token_type);
    return data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error);
    throw error;
  }
}

/**
 * Simple test function to upload a sample dataset to a Google Sheet
 */
async function testGoogleSheetsAPI() {
  console.log('Starting Google Sheets API Test');
  
  try {
    // Check if Google API is configured
    console.log("Checking Google API configuration...");
    console.log("Sheet ID defined:", Boolean(Config.google.sheetId));
    console.log("Service account email defined:", Boolean(Config.google.serviceAccountEmail));
    console.log("Private key defined:", Boolean(Config.google.privateKey));
    
    if (!Config.google.sheetId || !Config.google.serviceAccountEmail || !Config.google.privateKey) {
      console.error('Google API not configured. Please check your environment variables:');
      console.error('Required: GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY');
      return false;
    }
    
    // Generate JWT
    console.log("Generating JWT...");
    const jwt = await generateJWT(
      Config.google.serviceAccountEmail,
      Config.google.privateKey
    );
    
    // Get access token
    console.log("Getting access token...");
    const accessToken = await getAccessToken(jwt);
    
    // Test data
    const testData = [
      ['Test ID', 'Test Name', 'Timestamp'],
      ['1', 'Sheet API Test', new Date().toLocaleString()]
    ];
    
    // Upload test data
    const sheetId = Config.google.sheetId;
    const range = 'Sheet1!A1:C2';
    
    console.log(`Making API request to Google Sheets API...`);
    console.log(`Sheet ID: ${sheetId}, Range: ${range}`);
    
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
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Sheets API error response:", errorBody);
      throw new Error(`Google Sheets API error: ${response.status} ${errorBody}`);
    }
    
    const result = await response.json();
    console.log("API response:", JSON.stringify(result));
    
    Logger.info('Google Sheets API Test Successful!');
    Logger.info(`Updated cells: ${result.updatedCells}`);
    Logger.info(`Updated range: ${result.updatedRange}`);
    
    return true;
  } catch (error) {
    console.error('Google Sheets API Test Failed:', error);
    return false;
  }
}

// Run the test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Main test function starting...");
  testGoogleSheetsAPI()
    .then(success => {
      console.log("Test completed with result:", success);
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

export default testGoogleSheetsAPI;