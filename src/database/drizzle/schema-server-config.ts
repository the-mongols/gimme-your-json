// src/database/drizzle/schema-server-config.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Server configuration table
 * Stores Discord server-specific settings including default clan
 */
export const serverConfig = sqliteTable("server_config", {
  serverId: text("server_id").primaryKey(),      // Discord server ID
  defaultClanTag: text("default_clan_tag"),      // Default clan tag for this server
  adminRoleId: text("admin_role_id"),            // Admin role ID for permissions
  moderatorRoleId: text("moderator_role_id"),    // Moderator role ID for permissions
  logChannelId: text("log_channel_id"),          // Channel ID for logging
  updatedAt: integer("updated_at").notNull(),    // Last updated timestamp
  createdAt: integer("created_at").notNull(),    // Creation timestamp
});

/**
 * Channel configuration table
 * Stores channel-specific settings
 */
export const channelConfig = sqliteTable("channel_config", {
  channelId: text("channel_id").primaryKey(),    // Discord channel ID
  serverId: text("server_id").notNull(),         // Discord server ID
  clanTag: text("clan_tag"),                     // Clan tag associated with this channel
  type: text("type"),                            // Channel type/purpose
  settings: text("settings", { mode: "json" }),  // JSON settings
  updatedAt: integer("updated_at").notNull(),    // Last updated timestamp
  createdAt: integer("created_at").notNull(),    // Creation timestamp
});

/**
 * Role configuration table
 * Maps Discord roles to clan permissions
 */
export const roleConfig = sqliteTable("role_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serverId: text("server_id").notNull(),         // Discord server ID
  roleId: text("role_id").notNull(),             // Discord role ID
  clanTag: text("clan_tag"),                     // Associated clan tag
  permissions: text("permissions", { mode: "json" }), // JSON permissions
  updatedAt: integer("updated_at").notNull(),    // Last updated timestamp
  createdAt: integer("created_at").notNull(),    // Creation timestamp
});