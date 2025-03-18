/**
 * Ship performance metric calculator
 * Calculates a WAR-like compound score for ships
 */

// Base weights for the formula components
const DEFAULT_WEIGHTS = {
    winRate: 0.35,     // Win rate importance
    survivalRate: 0.15, // Survival rate importance
    damage: 0.35,      // Damage importance
    frags: 0.15,       // Kills importance
  };
  
  // Base expected values by tier and ship type
  const BASE_EXPECTED: Record<string, Record<string, { winRate: number; survivalRate: number; damage: number; frags: number }>> = {
    // Format: [tier][type] = { winRate, survivalRate, damage }
    
    // Tier 5
    "5": {
      "DD": { winRate: 50, survivalRate: 30, damage: 25000, frags: 0.7 },
      "CA": { winRate: 51, survivalRate: 35, damage: 35000, frags: 0.8 },
      "BB": { winRate: 52, survivalRate: 40, damage: 45000, frags: 0.6 },
      "CV": { winRate: 50, survivalRate: 60, damage: 40000, frags: 1.0 },
    },
    
    // Tier 6
    "6": {
      "DD": { winRate: 50, survivalRate: 30, damage: 30000, frags: 0.8 },
      "CA": { winRate: 51, survivalRate: 35, damage: 40000, frags: 0.9 },
      "BB": { winRate: 52, survivalRate: 40, damage: 55000, frags: 0.7 },
      "CV": { winRate: 50, survivalRate: 60, damage: 45000, frags: 1.1 },
    },
    
    // Tier 7
    "7": {
      "DD": { winRate: 50, survivalRate: 30, damage: 35000, frags: 0.9 },
      "CA": { winRate: 51, survivalRate: 35, damage: 45000, frags: 1.0 },
      "BB": { winRate: 52, survivalRate: 40, damage: 65000, frags: 0.8 },
      "CV": { winRate: 50, survivalRate: 60, damage: 55000, frags: 1.2 },
    },
    
    // Tier 8
    "8": {
      "DD": { winRate: 50, survivalRate: 30, damage: 40000, frags: 1.0 },
      "CA": { winRate: 51, survivalRate: 35, damage: 55000, frags: 1.1 },
      "BB": { winRate: 52, survivalRate: 40, damage: 75000, frags: 0.9 },
      "CV": { winRate: 50, survivalRate: 60, damage: 65000, frags: 1.3 },
    },
    
    // Tier 9
    "9": {
      "DD": { winRate: 50, survivalRate: 30, damage: 45000, frags: 1.1 },
      "CA": { winRate: 51, survivalRate: 35, damage: 65000, frags: 1.2 },
      "BB": { winRate: 52, survivalRate: 40, damage: 85000, frags: 1.0 },
      "CV": { winRate: 50, survivalRate: 60, damage: 75000, frags: 1.4 },
    },
    
    // Tier 10
    "10": {
      "DD": { winRate: 50, survivalRate: 30, damage: 50000, frags: 1.2 },
      "CA": { winRate: 51, survivalRate: 35, damage: 75000, frags: 1.3 },
      "BB": { winRate: 52, survivalRate: 40, damage: 100000, frags: 1.1 },
      "CV": { winRate: 50, survivalRate: 60, damage: 85000, frags: 1.5 },
    },
  };
  
  // Interface for ship metrics input
  export interface ShipMetrics {
    shipType: string;      // Ship type (DD, CA, BB, CV)
    tier: number;          // Ship tier
    winRate: number;       // Win rate percentage
    survivalRate: number;  // Survival rate percentage
    damageAvg: number;     // Average damage
    fragAvg?: number;      // Average frags (optional)
    battles: number;       // Number of battles
  }
  
  // Calculate the compound score for a ship
  export function calculateShipScore(metrics: ShipMetrics): number {
    // Get expected values for this ship type and tier
    const expected = getExpectedValues(metrics.tier, metrics.shipType);
    
    // Calculate normalized scores (how this ship performs relative to expected values)
    const winRateScore = metrics.winRate / expected.winRate;
    const survivalRateScore = metrics.survivalRate / expected.survivalRate;
    const damageScore = metrics.damageAvg / expected.damage;
    
    // Calculate frag score if available
    const fragScore = metrics.fragAvg 
      ? metrics.fragAvg / expected.frags 
      : 1.0; // Default to 1.0 if not provided
    
    // Apply weights to each component
    const weightedScore = 
      (winRateScore * DEFAULT_WEIGHTS.winRate) +
      (survivalRateScore * DEFAULT_WEIGHTS.survivalRate) +
      (damageScore * DEFAULT_WEIGHTS.damage) +
      (fragScore * DEFAULT_WEIGHTS.frags);
    
    // Calculate the final score (scale to a more readable range)
    const finalScore = weightedScore * 100;
    
    // Apply battle count adjustment (more battles = more reliable)
    return applyBattleAdjustment(finalScore, metrics.battles);
  }
  
  // Get expected values for a given tier and ship type
  function getExpectedValues(tier: number, shipType: string) {
    // Convert tier to string for use as a key
    const tierStr = tier.toString();
    
    // If exact tier not found, use closest tier
    const validTier = Object.keys(BASE_EXPECTED)
      .map(Number)
      .sort((a, b) => Math.abs(a - tier) - Math.abs(b - tier))[0].toString();
    
    // If ship type not found, use CA (cruiser) as default
    const validType = BASE_EXPECTED[validTier][shipType] 
      ? shipType 
      : "CA";
    
    return BASE_EXPECTED[validTier][validType];
  }
  
  // Apply battle count adjustment
  function applyBattleAdjustment(score: number, battles: number): number {
    if (battles < 10) {
      // Very few battles - heavily reduce reliability
      return score * (battles / 10);
    } else if (battles < 50) {
      // Few battles - slightly reduce reliability
      return score * (0.8 + (0.2 * (battles - 10) / 40));
    } else {
      // Enough battles - full score
      return score;
    }
  }
  
  // Calculate expected damage for a ship based on its type and tier
  export function calculateExpectedDamage(tier: number, shipType: string): number {
    const expected = getExpectedValues(tier, shipType);
    return expected.damage;
  }
  
  // Calculate damage ratio (player's damage / expected damage)
  export function calculateDamageRatio(avgDamage: number, tier: number, shipType: string): number {
    const expectedDamage = calculateExpectedDamage(tier, shipType);
    return avgDamage / expectedDamage;
  }