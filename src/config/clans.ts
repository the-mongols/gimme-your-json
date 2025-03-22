// src/config/clans.ts
/**
 * Configuration for supported clans
 */
import type { ColorResolvable } from 'discord.js';

export interface ClanConfig {
  id: number;       // Clan ID in WG API
  tag: string;      // Clan tag (e.g., "PN31")
  name: string;     // Full clan name
  cookies?: string; // Cookies for authentication with clan battles API
  color: ColorResolvable;  // Brand color for embeds (using Discord.js type)
  region: string;   // Server region (na, eu, asia, ru)
}
  
  /**
   * Clan configurations - load from environment variables when available
   */
  export const clans: Record<string, ClanConfig> = {
    "pn31": {
      id: parseInt(process.env.PN31_CLAN_ID || "1000072593"),
      tag: "PN31",
      name: "Penetration Nation",
      cookies: process.env.PN31_COOKIES,
      color: "#0099ff",
      region: "na"
    },
    "pn30": {
      id: parseInt(process.env.PN30_CLAN_ID || "1000000000"), // Replace with actual ID
      tag: "PN30",
      name: "Penetration Nation 30",
      cookies: process.env.PN30_COOKIES,
      color: "#00cc99",
      region: "na"
    },
    "pneu": {
      id: parseInt(process.env.PNEU_CLAN_ID || "1000000000"), // Replace with actual ID
      tag: "PNEU",
      name: "Penetration Nation EU",
      cookies: process.env.PNEU_COOKIES,
      color: "#ff9900",
      region: "eu"
    },
    "pn32": {
      id: parseInt(process.env.PN32_CLAN_ID || "1000000000"), // Replace with actual ID
      tag: "PN32",
      name: "Penetration Nation 32",
      cookies: process.env.PN32_COOKIES,
      color: "#cc00ff",
      region: "na"
    },
    "pn": {
      id: parseInt(process.env.PN_CLAN_ID || "1000000000"), // Replace with actual ID
      tag: "PN",
      name: "Penetration",
      cookies: process.env.PN_COOKIES,
      color: "#ff0066",
      region: "na"
    }
  };
  
  /**
   * Get clan configuration by tag (case insensitive)
   */
  export function getClanByTag(tag: string): ClanConfig | undefined {
    const normalizedTag = tag.toUpperCase();
    
    return Object.values(clans).find(clan => 
      clan.tag.toUpperCase() === normalizedTag
    );
  }
  
  /**
   * Get clan configuration by ID
   */
  export function getClanById(id: number): ClanConfig | undefined {
    return Object.values(clans).find(clan => clan.id === id);
  }
  
  /**
   * Get all clan tags
   */
  export function getAllClanTags(): string[] {
    return Object.values(clans).map(clan => clan.tag);
  }
  
  /**
   * Default clan to use when none is specified
   */
  export const defaultClan = clans.pn31;