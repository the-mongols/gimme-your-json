#!/usr/bin/env bun
// src/utils/cli/update-data.ts
import { Logger } from '../../utils/logger.js';
import setupLogging from '../../utils/logger-init.js';
import { initDatabase } from '../../database/init.js';
import { updateAllClansPlayerStats, updateClanPlayersData } from '../../services/dataupdater.js';
import { Config } from '../../utils/config.js';

// Setup logging first
setupLogging();

/**
 * CLI tool for updating player data
 */
async function main() {
  const args = process.argv.slice(2);
  const isAllClans = args.includes('--all');
  const clanTag = args.find(a => !a.startsWith('-'));
  
  Logger.info('Player Data Updater CLI');
  
  try {
    // Initialize database
    await initDatabase();
    
    // Determine what to update
    if (isAllClans) {
      Logger.info('Updating player data for all clans...');
      const result = await updateAllClansPlayerStats();
      
      Logger.info(`Update complete! Updated ${result.totalSuccess} players successfully, ${result.totalFailed} failed`);
      
      result.results.forEach(clanResult => {
        Logger.info(`- ${clanResult.clan}: ${clanResult.success} updated, ${clanResult.failed} failed`);
      });
    } 
    else if (clanTag) {
      const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
      
      if (!clan) {
        throw new Error(`Clan "${clanTag}" not found in configuration`);
      }
      
      Logger.info(`Updating player data for clan ${clan.tag}...`);
      const result = await updateClanPlayersData(clan);
      
      Logger.info(`Update complete! Updated ${result.success} players successfully, ${result.failed} failed`);
    }
    else {
      // Use default clan
      Logger.info(`Updating player data for default clan ${Config.defaultClan.tag}...`);
      const result = await updateClanPlayersData(Config.defaultClan);
      
      Logger.info(`Update complete! Updated ${result.success} players successfully, ${result.failed} failed`);
    }
    
    process.exit(0);
  } catch (error) {
    Logger.error('Error updating player data:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;