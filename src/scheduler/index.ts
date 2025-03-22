// src/scheduler/index.ts
import { updateAllClansPlayerStats } from '../services/dataupdater.js';
import { fetchAllClanBattlesData } from '../services/wargaming/clanbattles.js';
import { uploadDataToSheets } from '../services/sheets/client.js';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';

// Configuration for scheduled updates
const UPDATE_HOUR = Config.scheduler.updateHour;
const UPDATE_MINUTE = Config.scheduler.updateMinute;

export async function setupScheduler() {
  Logger.info('Setting up scheduled tasks...');
  
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
  
  Logger.info(`Next data update scheduled for ${nextUpdateTime.toLocaleString()}`);
  Logger.info(`(in ${Math.floor(timeUntilUpdate / (1000 * 60 * 60))} hours and ${Math.floor((timeUntilUpdate % (1000 * 60 * 60)) / (1000 * 60))} minutes)`);
  
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

// Run the scheduled update tasks for all clans
export async function runScheduledUpdate() {
  Logger.info('Running scheduled data update for all clans...');
  const startTime = Date.now();
  
  try {
    // Step 1: Update player data from WG API for all clans
    Logger.info('Updating player data from Wargaming API for all clans...');
    const updateResults = await updateAllClansPlayerStats();
    Logger.info(`Player data update completed: ${updateResults.totalSuccess} succeeded, ${updateResults.totalFailed} failed`);
    
    // Step 2: Update clan battles data for all clans
    Logger.info('Updating clan battles data for all clans...');
    const clanBattlesResults = await fetchAllClanBattlesData();
    Logger.info(`Clan battles data update completed: processed ${clanBattlesResults.totalProcessed} battles, ${clanBattlesResults.totalNew} new battles added`);
    
    // Step 3: Upload data to Google Sheets for all clans
    Logger.info('Uploading data to Google Sheets for all clans...');
    const sheetsResults = await uploadDataToSheets();
    Logger.info(`Google Sheets data upload completed`);
    
    // Step 4: Report completion
    const duration = (Date.now() - startTime) / 1000;
    Logger.info(`Scheduled update completed successfully in ${duration.toFixed(2)} seconds`);
    
    return {
      status: 'success',
      duration,
      playerUpdates: updateResults,
      clanBattles: clanBattlesResults,
      sheets: sheetsResults
    };
  } catch (error) {
    Logger.error('Error during scheduled update:', error);
    
    return {
      status: 'error',
      error: (error as Error).message,
      duration: (Date.now() - startTime) / 1000
    };
  }
}

// Function to trigger an immediate update (for admin commands)
export async function triggerManualUpdate(clanTag?: string) {
  Logger.info(`Manual update triggered ${clanTag ? `for clan ${clanTag}` : 'for all clans'}`);
  
  if (clanTag) {
    // Run update for a single clan
    const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
    
    if (!clan) {
      throw new Error(`Clan with tag "${clanTag}" not found in configuration`);
    }
    
    // Implementation for single clan update
    // TODO: Implement single clan update logic
    return {
      status: 'not_implemented',
      message: 'Single clan update not yet implemented'
    };
  } else {
    // Run update for all clans
    return runScheduledUpdate();
  }
}