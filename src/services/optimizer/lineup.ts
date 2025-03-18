import { db } from "../../database/db.js";
import { players, ships } from "../../database/drizzle/schema.js";
import { and, eq, inArray, desc, gt, gte, lte } from "drizzle-orm";

export interface ShipWithScore {
  id: string;
  playerId: string;
  playerName: string;
  name: string;
  tier: number;
  type: string;
  shipScore: number;
  battles: number;
  winRate: number;
  survivalRate?: number;
  damageAvg?: number;
}

export interface TeamComposition {
  requiredTypes: Record<string, number>; // e.g. { "DD": 2, "CA": 2, "BB": 3 }
  minTier: number;
  maxTier: number;
  maxTierSpread?: number;
}

export interface OptimalLineupResult {
  ships: ShipWithScore[];
  totalScore: number;
  averageTier: number;
  composition: Record<string, number>; // Actual composition
}

export async function generateOptimalLineup(
  discordIds: string[],
  composition: TeamComposition
): Promise<OptimalLineupResult> {
  try {
    // 1. Get players who are in the voice channel
    const voicePlayers = await db.select({
      id: players.id,
      username: players.username,
      discordId: players.discordId
    })
    .from(players)
    .where(inArray(players.discordId, discordIds));
    
    if (voicePlayers.length === 0) {
      throw new Error("No registered players found in voice channel");
    }
    
    const playerIds = voicePlayers.map(p => p.id);
    const playerMap = Object.fromEntries(voicePlayers.map(p => [p.id, p.username]));
    
    // 2. Get all ships for these players with scores
    const availableShips = await db.select({
      id: ships.id,
      playerId: ships.playerId,
      name: ships.name, 
      tier: ships.tier,
      type: ships.type,
      battles: ships.battles,
      winRate: ships.winRate,
      survivalRate: ships.survivalRate,
      damageAvg: ships.damageAvg,
      shipScore: ships.shipScore
    })
    .from(ships)
    .where(
      and(
        inArray(ships.playerId, playerIds),
        gt(ships.battles, 10), // Minimum battles requirement
        gte(ships.tier, composition.minTier), // Fixed comparison
        lte(ships.tier, composition.maxTier)  // Fixed comparison
      )
    )
    .orderBy(desc(ships.shipScore));
    
    // Add player names and ensure all values are properly handled
    const shipsWithPlayerNames: ShipWithScore[] = availableShips.map(ship => ({
      ...ship,
      playerName: playerMap[ship.playerId] || 'Unknown',
      // Ensure values are never null (fix for the type incompatibility)
      shipScore: ship.shipScore || 0,
      winRate: ship.winRate || 0, 
      survivalRate: ship.survivalRate || 0,
      damageAvg: ship.damageAvg || 0
    }));
    
    // 3. Run the optimization algorithm
    const optimalLineup = optimizeTeamComposition(
      shipsWithPlayerNames,
      composition
    );
    
    return optimalLineup;
  } catch (error) {
    console.error("Error generating lineup:", error);
    throw error;
  }
}

function optimizeTeamComposition(
  availableShips: ShipWithScore[],
  composition: TeamComposition
): OptimalLineupResult {
  // 1. Group ships by player
  const shipsByPlayer: Record<string, ShipWithScore[]> = {};
  for (const ship of availableShips) {
    if (!shipsByPlayer[ship.playerId]) {
      shipsByPlayer[ship.playerId] = [];
    }
    shipsByPlayer[ship.playerId].push(ship);
  }
  
  // 2. Group ships by type
  const shipsByType: Record<string, ShipWithScore[]> = {};
  for (const ship of availableShips) {
    if (!shipsByType[ship.type]) {
      shipsByType[ship.type] = [];
    }
    shipsByType[ship.type].push(ship);
  }
  
  // 3. Implementation of optimization algorithm
  // For this example, implementing a greedy algorithm with constraints
  return greedyTeamOptimization(shipsByPlayer, shipsByType, composition);
}

function greedyTeamOptimization(
  shipsByPlayer: Record<string, ShipWithScore[]>,
  shipsByType: Record<string, ShipWithScore[]>,
  composition: TeamComposition
): OptimalLineupResult {
  // Initialize result
  const selectedShips: ShipWithScore[] = [];
  const usedPlayers = new Set<string>();
  const typeCount: Record<string, number> = {};
  
  // Initialize type counts
  Object.keys(composition.requiredTypes).forEach(type => {
    typeCount[type] = 0;
  });
  
  // Create a prioritized list of ships
  const allShips = Object.values(shipsByPlayer).flat();
  
  // Sort by score (highest first)
  allShips.sort((a, b) => b.shipScore - a.shipScore);
  
  // Greedy selection process with constraints
  for (const ship of allShips) {
    // Skip if player already assigned
    if (usedPlayers.has(ship.playerId)) continue;
    
    // Skip if ship type quota is filled
    if (typeCount[ship.type] >= (composition.requiredTypes[ship.type] || 0)) continue;
    
    // Skip if tier spread constraint would be violated
    if (selectedShips.length > 0) {
      const tierSpread = composition.maxTierSpread || 2;
      const tiers = selectedShips.map(s => s.tier);
      const minTier = Math.min(...tiers);
      const maxTier = Math.max(...tiers);
      
      if (ship.tier < minTier - tierSpread || ship.tier > maxTier + tierSpread) continue;
    }
    
    // If we get here, ship can be added
    selectedShips.push(ship);
    usedPlayers.add(ship.playerId);
    typeCount[ship.type] = (typeCount[ship.type] || 0) + 1;
    
    // Check if team is complete
    const totalRequired = Object.values(composition.requiredTypes).reduce((a, b) => a + b, 0);
    if (selectedShips.length >= totalRequired) break;
  }
  
  // Calculate total score and average tier
  const totalScore = selectedShips.reduce((sum, ship) => sum + ship.shipScore, 0);
  const averageTier = selectedShips.length > 0 
    ? selectedShips.reduce((sum, ship) => sum + ship.tier, 0) / selectedShips.length 
    : 0;
  
  // Count actual composition
  const actualComposition: Record<string, number> = {};
  for (const ship of selectedShips) {
    actualComposition[ship.type] = (actualComposition[ship.type] || 0) + 1;
  }
  
  return { 
    ships: selectedShips, 
    totalScore,
    averageTier,
    composition: actualComposition
  };
}