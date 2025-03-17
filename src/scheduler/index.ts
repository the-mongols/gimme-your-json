import { updateAllPlayersData } from '../services/wargaming/api.js';
import { uploadDataToSheet } from '../services/sheets/client.js';

// Configuration for scheduled updates
const UPDATE_HOUR = parseInt(process.env.UPDATE_HOUR || '0', 10);
const UPDATE_MINUTE = parseInt(process.env.UPDATE_MINUTE || '0', 10);

export async function setupScheduler() {
  console.log('Setting up scheduled tasks...');
  
  // Schedule daily data update - using Bun's native setTimeout for simplicity
  // In production, consider using a more robust scheduler
  scheduleNextUpdate();
  
  return {
    status: 'scheduled',
    nextUpdate: getNextUpdateTime()
  };
}

function scheduleNextUpdate() {
  // Calculate time until next update
  const nextUpdateTime = getNextUpdateTime();
  const now = new Date();
  const timeUntilUpdate = nextUpdateTime.getTime() - now.getTime();
  
  console.log(`Next data update scheduled for ${nextUpdateTime.toLocaleString()}`);
  console.log(`(in ${Math.floor(timeUntilUpdate / (1000 * 60 * 60))} hours and ${Math.floor((timeUntilUpdate % (1000 * 60 * 60)) / (1000 * 60))} minutes)`);
  
  // Schedule the update
  setTimeout(async () => {
    try {
      await runScheduledUpdate();
    } finally {
      // Schedule next update regardless of success/failure
      scheduleNextUpdate();
    }
  }, timeUntilUpdate);
}

// Calculate the next update time
function getNextUpdateTime(): Date {
  const now = new Date();
  const nextUpdate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    UPDATE_HOUR,
    UPDATE_MINUTE,
    0
  );
  
  // If the scheduled time has already passed today, schedule for tomorrow
  if (nextUpdate.getTime() <= now.getTime()) {
    nextUpdate.setDate(nextUpdate.getDate() + 1);
  }
  
  return nextUpdate;
}

// Run the scheduled update tasks
export async function runScheduledUpdate() {
  console.log('Running scheduled data update...');
  const startTime = Date.now();
  
  try {
    // Step 1: Update player data from WG API
    console.log('Updating player data from Wargaming API...');
    const updateResults = await updateAllPlayersData();
    console.log(`Player data update completed: ${updateResults.success} succeeded, ${updateResults.failed} failed`);
    
    // Step 2: Upload data to Google Sheets
    console.log('Uploading data to Google Sheets...');
    await uploadDataToSheet();
    console.log('Google Sheets data upload completed');
    
    // Step 3: Report completion
    const duration = (Date.now() - startTime) / 1000;
    console.log(`Scheduled update completed successfully in ${duration.toFixed(2)} seconds`);
    
    return {
      status: 'success',
      duration,
      playerUpdates: updateResults
    };
  } catch (error) {
    console.error('Error during scheduled update:', error);
    
    return {
      status: 'error',
      error: (error as Error).message,
      duration: (Date.now() - startTime) / 1000
    };
  }
}

// Function to trigger an immediate update (for admin commands)
export async function triggerManualUpdate() {
  console.log('Manual update triggered');
  return runScheduledUpdate();
}