#!/usr/bin/env bun
// src/utils/cli/minimal-sheets-test.ts
import { Config } from '../../utils/config.js';
import crypto from 'crypto';

console.log("Starting Minimal Google Sheets Test");

async function generateJWT(email: string, privateKey: string): Promise<string | null> {
  console.log("\n1. Generating JWT");
  console.log(`   Email: ${email}`);
  console.log(`   Private key starts with: ${privateKey.substring(0, 20)}...`);
  
  // Verify key format
  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    console.error("   ERROR: Private key format is incorrect - missing BEGIN header");
    console.error(`   Key starts with: ${privateKey.substring(0, 30)}...`);
    return null;
  }

  // Create JWT
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const payload = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: expiry,
    iat: now
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  try {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    sign.end();
    
    const signature = sign.sign(privateKey);
    const encodedSignature = signature.toString('base64url');
    
    const jwt = `${signingInput}.${encodedSignature}`;
    console.log("   JWT generated successfully!");
    return jwt;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   ERROR signing JWT: ${errorMessage}`);
    console.error("   This usually indicates a problem with the private key format");
    return null;
  }
}

async function getAccessToken(jwt: string | null): Promise<string | null> {
  console.log("\n2. Getting Access Token");
  
  if (!jwt) {
    console.error("   Cannot get access token: JWT is null");
    return null;
  }
  
  try {
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
    
    console.log(`   Response status: ${response.status}`);
    const data = await response.text();
    
    try {
      const jsonData = JSON.parse(data) as { access_token?: string };
      if (jsonData.access_token) {
        console.log("   Successfully received access token!");
        return jsonData.access_token;
      } else {
        console.error(`   No access token in response: ${data.substring(0, 200)}...`);
        return null;
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`   Error parsing JSON response: ${errorMessage}`);
      console.error(`   Response text: ${data.substring(0, 200)}...`);
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   Error getting access token: ${errorMessage}`);
    return null;
  }
}

async function checkSheetAccess(sheetId: string, accessToken: string | null): Promise<boolean> {
  console.log(`\n3. Checking access to sheet: ${sheetId}`);
  
  if (!accessToken) {
    console.error("   Cannot check sheet access: Access token is null");
    return false;
  }
  
  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    console.log(`   Response status: ${response.status}`);
    const data = await response.text();
    
    if (response.status === 200) {
      try {
        const jsonData = JSON.parse(data) as { 
          properties?: { title?: string } 
        };
        console.log(`   SUCCESS! Sheet title: "${jsonData.properties?.title}"`);
        return true;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error(`   Error parsing JSON response: ${errorMessage}`);
        return false;
      }
    } else if (response.status === 404) {
      console.error("   ERROR: Spreadsheet not found (404)");
      console.error("   Check if the spreadsheet ID is correct");
      return false;
    } else if (response.status === 403) {
      console.error("   ERROR: Permission denied (403)");
      console.error("   Make sure you've shared the spreadsheet with the service account email");
      console.error(`   Service account: ${Config.google.serviceAccountEmail}`);
      return false;
    } else {
      console.error(`   Unexpected response: ${data.substring(0, 200)}...`);
      return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   Error checking sheet access: ${errorMessage}`);
    return false;
  }
}

async function testWriteToSheet(sheetId: string, accessToken: string | null): Promise<boolean> {
  console.log("\n4. Testing write to sheet");
  
  if (!accessToken) {
    console.error("   Cannot write to sheet: Access token is null");
    return false;
  }
  
  // Simple test data
  const values = [
    ["Test ID", "Test Name", "Timestamp"],
    ["1", "Minimal Test", new Date().toISOString()]
  ];
  
  try {
    // Try Sheet1 first
    const sheetName = "Sheet1";
    const range = `${sheetName}!A1:C2`;
    
    console.log(`   Attempting to write to range: ${range}`);
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: values
        })
      }
    );
    
    console.log(`   Response status: ${response.status}`);
    const data = await response.text();
    
    if (response.status === 200) {
      try {
        const jsonData = JSON.parse(data) as {
          updatedCells?: number;
          updatedRange?: string;
        };
        console.log(`   SUCCESS! Updated ${jsonData.updatedCells} cells in range ${jsonData.updatedRange}`);
        return true;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error(`   Error parsing JSON response: ${errorMessage}`);
        return false;
      }
    } else {
      console.error(`   Error response: ${data.substring(0, 200)}...`);
      
      // If the sheet doesn't exist, try with a clan tag
      if (data.includes("Unable to parse range")) {
        // Get first clan tag
        const clanTag = Object.values(Config.clans)[0]?.tag || 'PN31';
        console.log(`\n   Sheet1 not found. Trying with clan tag "${clanTag}" as sheet name...`);
        
        const clanRange = `${clanTag}!A1:C2`;
        
        const clanResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${clanRange}?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              values: values
            })
          }
        );
        
        console.log(`   Response status: ${clanResponse.status}`);
        const clanData = await clanResponse.text();
        
        if (clanResponse.status === 200) {
          try {
            const jsonData = JSON.parse(clanData) as {
              updatedCells?: number;
              updatedRange?: string;
            };
            console.log(`   SUCCESS with clan tag! Updated ${jsonData.updatedCells} cells in range ${jsonData.updatedRange}`);
            return true;
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error(`   Error parsing JSON response: ${errorMessage}`);
            return false;
          }
        } else {
          console.error(`   Error response with clan tag: ${clanData.substring(0, 200)}...`);
          return false;
        }
      }
      
      return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   Error writing to sheet: ${errorMessage}`);
    return false;
  }
}

async function runTest(): Promise<boolean> {
  console.log("Checking Google Sheets configuration...");
  console.log(`Sheet ID: ${Config.google.sheetId}`);
  console.log(`Service account email: ${Config.google.serviceAccountEmail}`);
  console.log(`Private key length: ${Config.google.privateKey?.length || 0}`);
  
  if (!Config.google.sheetId || !Config.google.serviceAccountEmail || !Config.google.privateKey) {
    console.error('Required configuration missing. Check your environment variables.');
    return false;
  }
  
  const jwt = await generateJWT(Config.google.serviceAccountEmail, Config.google.privateKey);
  const accessToken = await getAccessToken(jwt);
  const hasAccess = await checkSheetAccess(Config.google.sheetId, accessToken);
  
  if (hasAccess) {
    const writeSuccess = await testWriteToSheet(Config.google.sheetId, accessToken);
    
    if (writeSuccess) {
      console.log("\n✅ ALL TESTS PASSED! Your Google Sheets integration is working correctly.");
      return true;
    } else {
      console.log("\n❌ Write test failed. Check the error messages above.");
      return false;
    }
  } else {
    console.log("\n❌ Sheet access test failed. Check the error messages above.");
    return false;
  }
}

// Run the test
runTest()
  .then(success => {
    console.log(`\nTest completed with ${success ? "SUCCESS" : "FAILURE"}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Unhandled error:", errorMessage);
    process.exit(1);
  });