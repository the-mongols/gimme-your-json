// src/services/wargaming/api.ts (update to use the client)
import { db } from "../../database/db.js";
import { players, ships, statHistory } from "../../database/drizzle/schema.js";
import { eq } from "drizzle-orm";
import { wgApi } from "./client.js";
import { calculateShipScore as calculateScore } from "../metrics/calculator.js";
import { Logger } from "../../utils/logger.js";

// Interface for ship encyclopedia data
interface ShipInfo {
  name: string;
  tier: number;
  type: string;
  nation: string;
}

// Fetch player by account name
export async function fetchPlayerByName(username: string) {
  try {
    const players = await wgApi.findPlayerByName(username);
    
    if (!players || players.length === 0) {
      throw new Error(`Player "${username}" not found`);
    }
    
    // Return first matching player
    return players[0];
  } catch (error) {
    Logger.error(`Error fetching player by name (${username})`, error);
    throw error;
  }
}

// Fetch player by account ID
export async function fetchPlayerById(accountId: string) {
  try {
    const playerData = await wgApi.getPlayerById(accountId);
    
    if (!playerData) {
      throw new Error(`Player with ID "${accountId}" not found`);
    }
    
    return playerData;
  } catch (error) {
    Logger.error(`Error fetching player by ID (${accountId})`, error);
    throw error;
  }
}

// Fetch player's ship statistics
export async function fetchPlayerShips(accountId: string) {
  try {
    const shipsData = await wgApi.getPlayerShips(accountId);
    
    if (!shipsData || shipsData.length === 0) {
      throw new Error(`No ship data found for player ID "${accountId}"`);
    }
    
    return shipsData;
  } catch (error) {
    Logger.error(`Error fetching player ships (${accountId})`, error);
    throw error;
  }
}

// Fetch ship details from encyclopedia
export async function fetchShipInfo(shipId: string): Promise<ShipInfo> {
  try {
    const shipData = await wgApi.getShipInfo(shipId);
    
    if (!shipData) {
      throw new Error(`Ship with ID "${shipId}" not found in encyclopedia`);
    }
    
    // Map API ship type codes to readable types
    const typeMap: Record<string, string> = {
      "Destroyer": "DD",
      "Cruiser": "CA",
      "Battleship": "BB",
      "AirCarrier": "CV",
      "Submarine": "SS"
    };
    
    return {
      name: shipData.name,
      tier: shipData.tier,
      type: typeMap[shipData.type] || shipData.type,
      nation: shipData.nation
    };
  } catch (error) {
    Logger.error(`Error fetching ship info (${shipId})`, error);
    // Return a default object for error cases
    return {
      name: `Unknown Ship (${shipId})`,
      tier: 1,
      type: "Unknown",
      nation: "Unknown"
    };
  }
}

// The rest of the file remains largely the same, just replace console.log/error with Logger