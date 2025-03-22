import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { db } from '../../../database/db.js';
import { clan_battles, clan_battle_teams, clan_battle_players } from "../../../database/drizzle/schema";
import { desc, eq, and, inArray, like } from 'drizzle-orm';

export default {
  category: 'wows',
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('clan-battles')
    .setDescription('Show clan battles statistics')
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('Show overall clan battles statistics'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('player')
        .setDescription('Show player statistics')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Player name')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('recent')
        .setDescription('Show recent battles')
        .addIntegerOption(option =>
          option.setName('count')
            .setDescription('Number of battles to show')
            .setRequired(false))),
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
      switch (subcommand) {
        case 'stats':
          await showOverallStats(interaction);
          break;
        case 'player':
          await showPlayerStats(interaction);
          break;
        case 'recent':
          await showRecentBattles(interaction);
          break;
        default:
          await interaction.editReply('Unknown subcommand');
      }
    } catch (error) {
      console.error(`Error executing clan-battles command (${subcommand}):`, error);
      await interaction.editReply(`Error: ${(error as Error).message}`);
    }
  }
};

// Show overall statistics
async function showOverallStats(interaction: ChatInputCommandInteraction): Promise<void> {
  // Get total battles count
  const battles = await db.select()
    .from(clan_battles)
    .all();
  
  const battleCount = battles.length;
  
  // Get PN31 battles count (battles with at least one PN31 player)
  const pn31Players = await db.select()
    .from(clan_battle_players)
    .where(eq(clan_battle_players.is_pn31, 1))
    .all();
  
  // Create a set of unique battle IDs
  const pn31BattleIds = new Set<string>();
  for (const player of pn31Players) {
    if (player.battle_id) {
      pn31BattleIds.add(player.battle_id);
    }
  }
  
  const pn31BattlesCount = pn31BattleIds.size;
  
  // Get PN31 player IDs
  const pn31PlayerIds = new Set<string>();
  for (const player of pn31Players) {
    if (player.player_id) {
      pn31PlayerIds.add(player.player_id);
    }
  }
  
  const pn31PlayerCount = pn31PlayerIds.size;
  
  // Count wins/losses for PN31 teams
  let wins = 0;
  let losses = 0;
  
  for (const battleId of pn31BattleIds) {
    // Get teams for this battle
    const battlePlayers = pn31Players.filter(p => p.battle_id === battleId);
    
    // Get unique team IDs for PN31 players
    const teamIds = new Set<number>();
    for (const player of battlePlayers) {
      if (player.team_id) {
        teamIds.add(player.team_id);
      }
    }
    
    // Check result for each team
    for (const teamId of teamIds) {
      const team = await db.select()
        .from(clan_battle_teams)
        .where(eq(clan_battle_teams.id, teamId))
        .get();
      
      if (team?.result === 'win') {
        wins++;
      } else if (team?.result === 'lose') {
        losses++;
      }
    }
  }
  
  // Calculate win rate percentage if there are battles
  const winRate = wins + losses > 0 ? (wins / (wins + losses) * 100).toFixed(1) : '0.0';
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle('PN31 Clan Battles Statistics')
    .setColor('#0099ff')
    .addFields(
      { name: 'Total Battles Tracked', value: battleCount.toString(), inline: true },
      { name: 'PN31 Battles', value: pn31BattlesCount.toString(), inline: true },
      { name: 'Win Rate', value: `${wins} W / ${losses} L (${winRate}%)`, inline: true },
      { name: 'Player Count', value: pn31PlayerCount.toString(), inline: true }
    )
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
}

// Show player statistics
async function showPlayerStats(interaction: ChatInputCommandInteraction): Promise<void> {
  const playerName = interaction.options.getString('name', true);
  
  // Find player
  const playerMatches = await db
    .select()
    .from(clan_battle_players)
    .where(like(clan_battle_players.player_name, `%${playerName}%`))
    .all();
  
  if (playerMatches.length === 0) {
    await interaction.editReply(`No player found matching "${playerName}"`);
    return;
  }
  
  // Group by player ID (might have multiple matches)
  const playerGroups: Record<string, typeof playerMatches[0][]> = {};
  for (const match of playerMatches) {
    if (!match.player_id) continue;
    
    if (!playerGroups[match.player_id]) {
      playerGroups[match.player_id] = [];
    }
    playerGroups[match.player_id].push(match);
  }
  
  // If we have multiple players, show a list to choose from
  if (Object.keys(playerGroups).length > 1) {
    const playerList = Object.entries(playerGroups).map(([id, matches]) => {
      const player = matches[0];
      return `• ${player.player_name || 'Unknown'} (ID: ${player.player_id}, ${matches.length} battles)`;
    }).join('\n');
    
    await interaction.editReply(`Found multiple players matching "${playerName}":\n${playerList}\n\nPlease search with a more specific name.`);
    return;
  }
  
  // Get the single player we found
  const playerId = Object.keys(playerGroups)[0];
  if (!playerId || !playerGroups[playerId] || playerGroups[playerId].length === 0) {
    await interaction.editReply('Error: Could not process player data.');
    return;
  }
  
  const playerData = playerGroups[playerId][0];
  const playerBattles = playerGroups[playerId];
  
  // Calculate statistics
  const totalBattles = playerBattles.length;
  const survivedBattles = playerBattles.filter(b => b.survived === 1).length;
  
  // Count wins
  let wins = 0;
  let losses = 0;
  
  for (const battle of playerBattles) {
    if (!battle.team_id) continue;
    
    const team = await db
      .select()
      .from(clan_battle_teams)
      .where(eq(clan_battle_teams.id, battle.team_id))
      .get();
    
    if (team?.result === 'win') {
      wins++;
    } else if (team?.result === 'lose') {
      losses++;
    }
  }
  
  // Count ship usage
  const shipCounts: Record<string, number> = {};
  for (const battle of playerBattles) {
    if (!battle.ship_name) continue;
    
    const shipName = battle.ship_name;
    if (!shipCounts[shipName]) {
      shipCounts[shipName] = 0;
    }
    shipCounts[shipName]++;
  }
  
  // Sort ships by usage
  const sortedShips = Object.entries(shipCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  // Calculate win rate and survival rate percentages
  const winRate = totalBattles > 0 ? (wins / totalBattles * 100).toFixed(1) : '0.0';
  const survivalRate = totalBattles > 0 ? (survivedBattles / totalBattles * 100).toFixed(1) : '0.0';
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle(`Player Statistics: ${playerData.player_name || 'Unknown'}`)
    .setColor('#0099ff')
    .addFields(
      { name: 'Battles', value: totalBattles.toString(), inline: true },
      { name: 'Win Rate', value: `${wins} W / ${losses} L (${winRate}%)`, inline: true },
      { name: 'Survival Rate', value: `${survivalRate}%`, inline: true },
      { name: 'Most Used Ships', value: sortedShips.length > 0 ? 
                                        sortedShips.map(([ship, count]) => `${ship}: ${count}`).join('\n') : 
                                        'No data' }
    )
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
}

// Show recent battles
async function showRecentBattles(interaction: ChatInputCommandInteraction): Promise<void> {
  const count = interaction.options.getInteger('count') || 5;
  
  // Get recent battles
  const recentBattles = await db
    .select()
    .from(clan_battles)
    .orderBy(desc(clan_battles.finished_at))
    .limit(count)
    .all();
  
  if (recentBattles.length === 0) {
    await interaction.editReply('No battles found');
    return;
  }
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle(`Recent Clan Battles (${recentBattles.length})`)
    .setColor('#0099ff')
    .setTimestamp();
  
  for (const battle of recentBattles) {
    // Get teams
    const teams = await db
      .select()
      .from(clan_battle_teams)
      .where(eq(clan_battle_teams.battle_id, battle.id))
      .all();
    
    // Format team info
    const teamInfo = teams.map(team => 
      `Team ${team.team_number}: ${team.clan_tag || 'Unknown'} (${(team.result || 'UNKNOWN').toUpperCase()})`
    ).join(' vs ');
    
    // Format field value
    const fieldValue = [
      `Date: ${new Date(battle.finished_at || '').toLocaleString()}`,
      `Map: ${battle.map_name || 'Unknown'}`,
      `Teams: ${teamInfo}`
    ].join('\n');
    
    embed.addFields({ name: `Battle #${battle.id}`, value: fieldValue });
  }
  
  await interaction.editReply({ embeds: [embed] });
}