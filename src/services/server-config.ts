// src/services/server-config.ts
import { db } from "../database/db.js";
import { serverConfig, channelConfig, roleConfig } from "../database/drizzle/schema-server-config.js";
import { eq, and } from "drizzle-orm";
import { Config } from "../utils/config.js";
import { Logger } from "../utils/logger.js";

/**
 * Interface for server configuration data
 */
export interface ServerConfigData {
  serverId: string;
  defaultClanTag: string | null;
  adminRoleId: string | null;
  moderatorRoleId: string | null;
  logChannelId: string | null;
}

/**
 * Interface for channel configuration data
 */
export interface ChannelConfigData {
  channelId: string;
  serverId: string;
  clanTag: string | null;
  type: string | null;
  settings: Record<string, any> | null;
}

/**
 * Interface for role configuration data
 */
export interface RoleConfigData {
  id?: number;
  serverId: string;
  roleId: string;
  clanTag: string | null;
  permissions: string[] | null;
}

/**
 * Service for managing server configuration
 */
export class ServerConfigService {
  /**
   * Get server configuration, creating default if it doesn't exist
   * @param serverId Discord server ID
   * @returns Server configuration
   */
  static async getServerConfig(serverId: string): Promise<ServerConfigData> {
    try {
      // Try to get existing server config
      let config = await db.select()
        .from(serverConfig)
        .where(eq(serverConfig.serverId, serverId))
        .get();
      
      // If server config doesn't exist, create a new one with defaults
      if (!config) {
        const newConfig = {
          serverId,
          defaultClanTag: Config.defaultClan.tag,
          adminRoleId: null,
          moderatorRoleId: null,
          logChannelId: null,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        await db.insert(serverConfig).values(newConfig);
        config = newConfig;
      }
      
      return {
        serverId: config.serverId,
        defaultClanTag: config.defaultClanTag,
        adminRoleId: config.adminRoleId,
        moderatorRoleId: config.moderatorRoleId,
        logChannelId: config.logChannelId
      };
    } catch (error) {
      Logger.error(`Error getting server config for ${serverId}:`, error);
      // Return default config if database fails
      return {
        serverId,
        defaultClanTag: Config.defaultClan.tag,
        adminRoleId: null,
        moderatorRoleId: null,
        logChannelId: null
      };
    }
  }
  
  /**
   * Update server configuration
   * @param serverId Discord server ID
   * @param updates Fields to update
   * @returns Updated server configuration
   */
  static async updateServerConfig(
    serverId: string, 
    updates: Partial<Omit<ServerConfigData, 'serverId'>>
  ): Promise<ServerConfigData> {
    try {
      // Check if server config exists
      const configExists = await db.select({ exists: db.sql`1` })
        .from(serverConfig)
        .where(eq(serverConfig.serverId, serverId))
        .get();
      
      if (!configExists) {
        // Create new config if it doesn't exist
        await db.insert(serverConfig).values({
          serverId,
          defaultClanTag: updates.defaultClanTag || Config.defaultClan.tag,
          adminRoleId: updates.adminRoleId || null,
          moderatorRoleId: updates.moderatorRoleId || null,
          logChannelId: updates.logChannelId || null,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      } else {
        // Update existing config
        await db.update(serverConfig)
          .set({
            ...updates,
            updatedAt: Date.now()
          })
          .where(eq(serverConfig.serverId, serverId));
      }
      
      // Get updated config
      return this.getServerConfig(serverId);
    } catch (error) {
      Logger.error(`Error updating server config for ${serverId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get default clan tag for a server
   * @param serverId Discord server ID
   * @returns Default clan tag
   */
  static async getDefaultClanTag(serverId: string): Promise<string> {
    try {
      const config = await this.getServerConfig(serverId);
      return config.defaultClanTag || Config.defaultClan.tag;
    } catch (error) {
      // Return global default on error
      return Config.defaultClan.tag;
    }
  }
  
  /**
   * Set default clan tag for a server
   * @param serverId Discord server ID
   * @param clanTag Clan tag to set as default
   * @returns Success status
   */
  static async setDefaultClanTag(serverId: string, clanTag: string): Promise<boolean> {
    try {
      // Validate clan tag
      const validClan = Object.values(Config.clans).find(c => c.tag === clanTag);
      if (!validClan) {
        throw new Error(`Invalid clan tag: ${clanTag}`);
      }
      
      await this.updateServerConfig(serverId, { defaultClanTag: clanTag });
      return true;
    } catch (error) {
      Logger.error(`Error setting default clan tag for ${serverId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get channel configuration
   * @param channelId Discord channel ID
   * @returns Channel configuration or null if not found
   */
  static async getChannelConfig(channelId: string): Promise<ChannelConfigData | null> {
    try {
      const config = await db.select()
        .from(channelConfig)
        .where(eq(channelConfig.channelId, channelId))
        .get();
      
      if (!config) {
        return null;
      }
      
      return {
        channelId: config.channelId,
        serverId: config.serverId,
        clanTag: config.clanTag,
        type: config.type,
        settings: config.settings ? JSON.parse(config.settings) : null
      };
    } catch (error) {
      Logger.error(`Error getting channel config for ${channelId}:`, error);
      return null;
    }
  }
  
  /**
   * Set channel configuration
   * @param channelData Channel configuration data
   * @returns Success status
   */
  static async setChannelConfig(channelData: ChannelConfigData): Promise<boolean> {
    try {
      const { channelId, serverId, clanTag, type, settings } = channelData;
      
      // Check if channel config exists
      const configExists = await db.select({ exists: db.sql`1` })
        .from(channelConfig)
        .where(eq(channelConfig.channelId, channelId))
        .get();
      
      if (!configExists) {
        // Create new config
        await db.insert(channelConfig).values({
          channelId,
          serverId,
          clanTag,
          type,
          settings: settings ? JSON.stringify(settings) : null,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      } else {
        // Update existing config
        await db.update(channelConfig)
          .set({
            serverId,
            clanTag,
            type,
            settings: settings ? JSON.stringify(settings) : null,
            updatedAt: Date.now()
          })
          .where(eq(channelConfig.channelId, channelId));
      }
      
      return true;
    } catch (error) {
      Logger.error(`Error setting channel config for ${channelData.channelId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get role configuration for a server
   * @param serverId Discord server ID
   * @returns Array of role configurations
   */
  static async getServerRoles(serverId: string): Promise<RoleConfigData[]> {
    try {
      const roles = await db.select()
        .from(roleConfig)
        .where(eq(roleConfig.serverId, serverId))
        .all();
      
      return roles.map(role => ({
        id: role.id,
        serverId: role.serverId,
        roleId: role.roleId,
        clanTag: role.clanTag,
        permissions: role.permissions ? JSON.parse(role.permissions) : null
      }));
    } catch (error) {
      Logger.error(`Error getting server roles for ${serverId}:`, error);
      return [];
    }
  }
  
  /**
   * Get roles associated with a specific clan
   * @param serverId Discord server ID
   * @param clanTag Clan tag
   * @returns Array of role configurations for the clan
   */
  static async getClanRoles(serverId: string, clanTag: string): Promise<RoleConfigData[]> {
    try {
      const roles = await db.select()
        .from(roleConfig)
        .where(
          and(
            eq(roleConfig.serverId, serverId),
            eq(roleConfig.clanTag, clanTag)
          )
        )
        .all();
      
      return roles.map(role => ({
        id: role.id,
        serverId: role.serverId,
        roleId: role.roleId,
        clanTag: role.clanTag,
        permissions: role.permissions ? JSON.parse(role.permissions) : null
      }));
    } catch (error) {
      Logger.error(`Error getting clan roles for ${clanTag} in server ${serverId}:`, error);
      return [];
    }
  }
  
  /**
   * Add or update a role configuration
   * @param roleData Role configuration data
   * @returns Updated role configuration
   */
  static async setRoleConfig(roleData: RoleConfigData): Promise<RoleConfigData> {
    try {
      const { id, serverId, roleId, clanTag, permissions } = roleData;
      
      if (id) {
        // Update existing role
        await db.update(roleConfig)
          .set({
            serverId,
            roleId,
            clanTag,
            permissions: permissions ? JSON.stringify(permissions) : null,
            updatedAt: Date.now()
          })
          .where(eq(roleConfig.id, id));
          
        // Get updated role
        const updatedRole = await db.select()
          .from(roleConfig)
          .where(eq(roleConfig.id, id))
          .get();
          
        if (!updatedRole) {
          throw new Error(`Role with ID ${id} not found after update`);
        }
        
        return {
          id: updatedRole.id,
          serverId: updatedRole.serverId,
          roleId: updatedRole.roleId,
          clanTag: updatedRole.clanTag,
          permissions: updatedRole.permissions ? JSON.parse(updatedRole.permissions) : null
        };
      } else {
        // Create new role
        const newRole = {
          serverId,
          roleId,
          clanTag,
          permissions: permissions ? JSON.stringify(permissions) : null,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        const insertResult = await db.insert(roleConfig)
          .values(newRole)
          .returning();
          
        if (!insertResult || insertResult.length === 0) {
          throw new Error('Failed to insert role configuration');
        }
        
        return {
          id: insertResult[0].id,
          serverId,
          roleId,
          clanTag,
          permissions
        };
      }
    } catch (error) {
      Logger.error(`Error setting role config:`, error);
      throw error;
    }
  }
  
  /**
   * Delete a role configuration
   * @param roleId Role configuration ID
   * @returns Success status
   */
  static async deleteRoleConfig(id: number): Promise<boolean> {
    try {
      await db.delete(roleConfig)
        .where(eq(roleConfig.id, id));
      
      return true;
    } catch (error) {
      Logger.error(`Error deleting role config with ID ${id}:`, error);
      throw error;
    }
  }
}