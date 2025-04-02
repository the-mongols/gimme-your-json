#!/usr/bin/env bun
// src/utils/cli/update-battles.ts
import { Logger } from '../../utils/logger.js';
import setupLogging from '../../utils/logger-init.js';
import { initDatabase } from '../../database/init.js';
import { fetchAllClanBattlesData, fetchClanBattlesData } from '../../services/wargaming/clanbattles.js';
import { Config } from '../../utils/config.js';

// Setup logging first
setupLogging();

/**
 * CLI tool for updating clan battles data
 */
async function main() {
  const args = process.argv.slice(2);
  const isAllClans = args.includes('--all');
  const clanTag = args.find(a => !a.startsWith('-'));
  
  Logger.info('Clan Battles Data Updater CLI');
  
  try {
    // Initialize database
    await initDatabase();
    
    // Determine what to update
    if (isAllClans) {
      Logger.info('Updating clan battles data for all clans...');
      const result = await fetchAllClanBattlesData();
      
      Logger.info(`Update complete! Processed ${result.totalProcessed} battles, ${result.totalNew} new battles added`);
      
      result.results.forEach(clanResult => {
        Logger.info(`- ${clanResult.clan}: ${clanResult.processed} processed, ${clanResult.newBattles} new, ${clanResult.clanMemberPlayers} member entries`);
      });
    } 
    else if (clanTag) {
      Logger.info(`Updating clan battles data for clan ${clanTag}...`);
      const result = await fetchClanBattlesData(clanTag);
      
      Logger.info(`Update complete! Processed ${result.processed} battles, ${result.newBattles} new battles, ${result.clanMemberPlayers} member entries`);
    }
    else {
      // Use default clan
      Logger.info(`Updating clan battles data for default clan ${Config.defaultClan.tag}...`);
      const result = await fetchClanBattlesData(Config.defaultClan.tag);
      
      Logger.info(`Update complete! Processed ${result.processed} battles, ${result.newBattles} new battles, ${result.clanMemberPlayers} member entries`);
    }
    
    process.exit(0);
  } catch (error) {
    Logger.error('Error updating clan battles data:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;