// src/bot/commands/wows/clan-battles.ts
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';
import { db } from '../../../database/db.js';
import { clanBattles, clanBattleTeams, clanBattlePlayers } from "../../../database/drizzle/schema.js";
import { desc, eq, and, inArray, like } from 'drizzle-orm';
import { ServerConfigService } from '../../../services/server-config.js';
import { Logger } from '../../../utils/logger.js';
import { getAllClanTags } from '../../../config/clans.js';
import { Config } from '../../../utils/config.js';

// Create the command properly
const command = new SlashCommandBuilder()
  .setName('clan-battles')
  .setDescription('Show clan battles statistics');

// Add the clan option
command.addStringOption(option =>
  option.setName('clan')
    .setDescription('Clan to show stats for (defaults to server default)')
    .setRequired(false)
    .addChoices(...getAllClanTags().map(tag => ({ name: tag, value: tag })))
);

// Add subcommands directly (no group needed)
command.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName('stats')
    .setDescription('Show overall clan battles statistics')
);

command.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName('player')
    .setDescription('Show player statistics')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Player name')
        .setRequired(true))
);

command.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName('recent')
    .setDescription('Show recent battles')
    .addIntegerOption(option =>
      option.setName('count')
        .setDescription('Number of battles to show')
        .setRequired(false))
);

export default {
  category: 'wows',
  cooldown: 5,
  data: command,
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    // Ensure we have a guild context
    if (!interaction.guildId) {
      await interaction.editReply({
        content: 'This command can only be used in a server.',
      });
      return;
    }
    
    // Get the clan to use (from option or server default)
    const specifiedClanTag = interaction.options.getString('clan');
    const defaultClanTag = await ServerConfigService.getDefaultClanTag(interaction.guildId);
    const clanTag = specifiedClanTag || defaultClanTag;
    
    // Get the clan configuration
    const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
    
    if (!clan) {
      await interaction.editReply(`Error: Clan "${clanTag}" not found in configuration.`);
      return;
    }
    
    // Get subcommand
    const subcommand = interaction.options.getSubcommand();
    
    try {
      switch (subcommand) {
        case 'stats':
          await showOverallStats(interaction, clan.id.toString(), clanTag);
          break;
        case 'player':
          await showPlayerStats(interaction, clan.id.toString(), clanTag);
          break;
        case 'recent':
          await showRecentBattles(interaction, clan.id.toString(), clanTag);
          break;
        default:
          await interaction.editReply('Unknown subcommand');
      }
    } catch (error) {
      Logger.error(`Error executing clan-battles command (${subcommand}):`, error);
      await interaction.editReply(`Error: ${(error as Error).message}`);
    }
  }
};

// Show overall statistics
async function showOverallStats(
  interaction: ChatInputCommandInteraction, 
  clanId: string,
  clanTag: string
): Promise<void> {
  // Get total battles count
  const battles = await db.select()
    .from(clanBattles)
    .where(eq(clanBattles.clanId, clanId))
    .all();
  
  const battleCount = battles.length;
  
  // Get clan member battles count (battles with at least one clan member)
  const clanMemberPlayers = await db.select()
    .from(clanBattlePlayers)
    .where(
      and(
        eq(clanBattlePlayers.clanId, clanId),
        eq(clanBattlePlayers.isClanMember, 1)
      )
    )
    .all();
  
  // Create a set of unique battle IDs
  const clanMemberBattleIds = new Set<string>();
  for (const player of clanMemberPlayers) {
    if (player.battleId) {
      clanMemberBattleIds.add(player.battleId);
    }
  }
  
  const clanMemberBattlesCount = clanMemberBattleIds.size;
  
  // Get clan member player IDs
  const clanMemberPlayerIds = new Set<string>();
  for (const player of clanMemberPlayers) {
    if (player.playerId) {
      clanMemberPlayerIds.add(player.playerId);
    }
  }
  
  const clanMemberPlayerCount = clanMemberPlayerIds.size;
  
  // Count wins/losses for clan member teams
  let wins = 0;
  let losses = 0;
  
  for (const battleId of clanMemberBattleIds) {
    // Get teams for this battle
    const battlePlayers = clanMemberPlayers.filter(p => p.battleId === battleId);
    
    // Get unique team IDs for clan member players
    const teamIds = new Set<number>();
    for (const player of battlePlayers) {
      if (player.teamId) {
        teamIds.add(player.teamId);
      }
    }
    
    // Check result for each team
    for (const teamId of teamIds) {
      const team = await db.select()
        .from(clanBattleTeams)
        .where(
          and(
            eq(clanBattleTeams.id, teamId),
            eq(clanBattleTeams.clanId, clanId)
          )
        )
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
  
  // Find the clan config for color
  const clan = Object.values(Config.clans).find(c => c.id.toString() === clanId);
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle(`${clanTag} Clan Battles Statistics`)
    .setColor(clan?.color || '#0099ff')
    .addFields(
      { name: 'Total Battles Tracked', value: battleCount.toString(), inline: true },
      { name: `${clanTag} Battles`, value: clanMemberBattlesCount.toString(), inline: true },
      { name: 'Win Rate', value: `${wins} W / ${losses} L (${winRate}%)`, inline: true },
      { name: 'Player Count', value: clanMemberPlayerCount.toString(), inline: true }
    )
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
}

// Show player statistics
async function showPlayerStats(
  interaction: ChatInputCommandInteraction,
  clanId: string,
  clanTag: string
): Promise<void> {
  const playerName = interaction.options.getString('name', true);
  
  // Find player
  const playerMatches = await db
    .select()
    .from(clanBattlePlayers)
    .where(
      and(
        like(clanBattlePlayers.playerName, `%${playerName}%`),
        eq(clanBattlePlayers.clanId, clanId)
      )
    )
    .all();
  
  if (playerMatches.length === 0) {
    await interaction.editReply(`No player found matching "${playerName}" in ${clanTag} battles`);
    return;
  }
  
  // Group by player ID (might have multiple matches)
  const playerGroups: Record<string, typeof playerMatches[0][]> = {};
  for (const match of playerMatches) {
    if (!match.playerId) continue;
    
    if (!playerGroups[match.playerId]) {
      playerGroups[match.playerId] = [];
    }
    playerGroups[match.playerId].push(match);
  }
  
  // If we have multiple players, show a list to choose from
  if (Object.keys(playerGroups).length > 1) {
    const playerList = Object.entries(playerGroups).map(([id, matches]) => {
      const player = matches[0];
      return `• ${player.playerName || 'Unknown'} (ID: ${player.playerId}, ${matches.length} battles)`;
    }).join('\n');
    
    await interaction.editReply(`Found multiple players matching "${playerName}" in ${clanTag} battles:\n${playerList}\n\nPlease search with a more specific name.`);
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
    if (!battle.teamId) continue;
    
    const team = await db
      .select()
      .from(clanBattleTeams)
      .where(
        and(
          eq(clanBattleTeams.id, battle.teamId),
          eq(clanBattleTeams.clanId, clanId)
        )
      )
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
    if (!battle.shipName) continue;
    
    const shipName = battle.shipName;
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
  
  // Find the clan config for color
  const clan = Object.values(Config.clans).find(c => c.id.toString() === clanId);
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle(`Player Statistics: ${playerData.playerName || 'Unknown'} (${clanTag})`)
    .setColor(clan?.color || '#0099ff')
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
async function showRecentBattles(
  interaction: ChatInputCommandInteraction,
  clanId: string,
  clanTag: string
): Promise<void> {
  const count = interaction.options.getInteger('count') || 5;
  
  // Get recent battles
  const recentBattles = await db
    .select()
    .from(clanBattles)
    .where(eq(clanBattles.clanId, clanId))
    .orderBy(desc(clanBattles.finishedAt))
    .limit(count)
    .all();
  
  if (recentBattles.length === 0) {
    await interaction.editReply(`No battles found for ${clanTag}`);
    return;
  }
  
  // Find the clan config for color
  const clan = Object.values(Config.clans).find(c => c.id.toString() === clanId);
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle(`Recent ${clanTag} Clan Battles (${recentBattles.length})`)
    .setColor(clan?.color || '#0099ff')
    .setTimestamp();
  
  for (const battle of recentBattles) {
    // Get teams
    const teams = await db
      .select()
      .from(clanBattleTeams)
      .where(
        and(
          eq(clanBattleTeams.battleId, battle.id),
          eq(clanBattleTeams.clanId, clanId)
        )
      )
      .all();
    
    // Format team info
    const teamInfo = teams.map(team => 
      `Team ${team.teamNumber}: ${team.clanTag || 'Unknown'} (${(team.result || 'UNKNOWN').toUpperCase()})`
    ).join(' vs ');
    
    // Format field value
    const fieldValue = [
      `Date: ${new Date(battle.finishedAt || '').toLocaleString()}`,
      `Map: ${battle.mapName || 'Unknown'}`,
      `Teams: ${teamInfo}`
    ].join('\n');
    
    embed.addFields({ name: `Battle #${battle.id}`, value: fieldValue });
  }
  
  await interaction.editReply({ embeds: [embed] });
}