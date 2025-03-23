// src/bot/commands/roster/index.ts
import { SlashCommandBuilder, PermissionFlagsBits, TextChannel } from 'discord.js';
import type { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';
import { db } from '../../../database/db.js';
import { players } from '../../../database/drizzle/schema.js';
import { eq, and } from 'drizzle-orm';
import { ServerConfigService } from '../../../services/server-config.js';
import { getApiClientForClan } from '../../../services/wargaming/client.js';
import { addPlayerToClan, updatePlayerInClan } from '../../../services/dataupdater.js';
import { Logger } from '../../../utils/logger.js';
import { getAllClanTags } from '../../../config/clans.js';
import { Config } from '../../../utils/config.js';

// Create the SlashCommandBuilder instance
const command = new SlashCommandBuilder()
  .setName('roster')
  .setDescription('Manage the player roster')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles); // Restrict to users with appropriate permissions

// Add common clan option to the base command
command.addStringOption(option =>
  option.setName('clan')
    .setDescription('Clan to manage (defaults to server default)')
    .setRequired(false)
    .addChoices(...getAllClanTags().map(tag => ({ name: tag, value: tag })))
);

// Add player subcommand
command.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName('add')
    .setDescription('Add a player to the roster')
    .addUserOption(option =>
      option.setName('discord_user')
        .setDescription('Discord user to add to the roster')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('player_id')
        .setDescription('WG account ID (numeric)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('player_name')
        .setDescription('In-game name (optional, will be fetched if not provided)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('clan_tag')
        .setDescription('In-game clan tag (optional)')
        .setRequired(false))
);

// Edit player subcommand
command.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName('edit')
    .setDescription('Edit a player in the roster')
    .addUserOption(option =>
      option.setName('discord_user')
        .setDescription('Discord user to edit')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('player_id')
        .setDescription('New WG account ID (numeric)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('player_name')
        .setDescription('New in-game name')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('clan_tag')
        .setDescription('New in-game clan tag')
        .setRequired(false))
);

// Remove player subcommand
command.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName('remove')
    .setDescription('Remove a player from the roster')
    .addUserOption(option =>
      option.setName('discord_user')
        .setDescription('Discord user to remove')
        .setRequired(true))
);

// List roster subcommand
command.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName('list')
    .setDescription('List all players in the roster')
    .addBooleanOption(option => 
      option.setName('detailed')
        .setDescription('Show detailed information')
        .setRequired(false))
);

// Find player subcommand (by in-game name)
command.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName('find')
    .setDescription('Find a player in the roster by name')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Player in-game name')
        .setRequired(true))
);

// Main roster command with subcommands
export default {
  category: 'roster',
  cooldown: 5,
  data: command,
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Ensure we have a guild context
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true
      });
      return;
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    // Get the clan to use (from option or server default)
    const specifiedClanTag = interaction.options.getString('clan');
    const defaultClanTag = await ServerConfigService.getDefaultClanTag(interaction.guildId);
    const clanTag = specifiedClanTag || defaultClanTag;
    
    // Process subcommands
    switch (subcommand) {
      case 'add':
        return await handleAddPlayer(interaction, clanTag);
      case 'edit':
        return await handleEditPlayer(interaction, clanTag);
      case 'remove':
        return await handleRemovePlayer(interaction, clanTag);
      case 'list':
        return await handleListRoster(interaction, clanTag);
      case 'find':
        return await handleFindPlayer(interaction, clanTag);
      default:
        await interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true
        });
    }
  }
};

// Handler for adding a player
async function handleAddPlayer(interaction: ChatInputCommandInteraction, clanTag: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const discordUser = interaction.options.getUser('discord_user', true);
    const playerId = interaction.options.getString('player_id', true);
    const playerName = interaction.options.getString('player_name');
    const playerClanTag = interaction.options.getString('clan_tag');
    
    // Add player to the clan roster
    await addPlayerToClan(
      playerId,
      discordUser.id,
      clanTag,
      playerName,
      playerClanTag
    );
    
    // Get the clan object for the message
    const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
    
    await interaction.editReply(
      `Successfully added ${playerName || playerId}${playerClanTag ? ` [${playerClanTag}]` : ''} to the ${clan?.tag || clanTag} roster!`
    );
    
    // Schedule an immediate data update for this player
    interaction.followUp({
      content: `Fetching data for player... This may take a moment.`,
      ephemeral: true
    });
    
    try {
      await updatePlayerInClan(playerId, clanTag);
      await interaction.followUp({
        content: `Data update complete for player!`,
        ephemeral: true
      });
    } catch (error) {
      await interaction.followUp({
        content: `Warning: Initial data fetch failed: ${(error as Error).message}`,
        ephemeral: true
      });
    }
  } catch (error) {
    Logger.error('Error adding player to roster:', error);
    await interaction.editReply(`Failed to add player: ${(error as Error).message}`);
  }
}

// Handler for editing a player
async function handleEditPlayer(interaction: ChatInputCommandInteraction, clanTag: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const discordUser = interaction.options.getUser('discord_user', true);
    const newPlayerId = interaction.options.getString('player_id');
    const newPlayerName = interaction.options.getString('player_name');
    const newClanTag = interaction.options.getString('clan_tag');
    
    // Get the clan ID
    const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
    if (!clan) {
      await interaction.editReply(`Error: Clan "${clanTag}" not found in configuration.`);
      return;
    }
    
    // Check if player exists in the roster
    const existingPlayer = await db.select()
      .from(players)
      .where(
        and(
          eq(players.discordId, discordUser.id),
          eq(players.clanId, clan.id.toString())
        )
      )
      .get();
    
    if (!existingPlayer) {
      await interaction.editReply(`Error: ${discordUser.tag} is not in the ${clanTag} roster. Use \`/roster add\` to add them first.`);
      return;
    }
    
    // Prepare update data
    const updateData: any = {
      lastUpdated: Date.now()
    };
    
    if (newPlayerId) updateData.id = newPlayerId;
    if (newPlayerName) updateData.username = newPlayerName;
    if (newClanTag !== null) updateData.clanTag = newClanTag; // Allow empty string to remove clan tag
    
    // Update the player
    await db.update(players)
      .set(updateData)
      .where(
        and(
          eq(players.discordId, discordUser.id),
          eq(players.clanId, clan.id.toString())
        )
      );
    
    await interaction.editReply(`Successfully updated ${discordUser.tag} in the ${clanTag} roster!`);
    
    // If player ID was changed, update their data
    if (newPlayerId) {
      try {
        await updatePlayerInClan(newPlayerId, clanTag);
        await interaction.followUp({
          content: `Updated data for player with new ID: ${newPlayerId}`,
          ephemeral: true
        });
      } catch (error) {
        await interaction.followUp({
          content: `Warning: Could not update data for new player ID: ${(error as Error).message}`,
          ephemeral: true
        });
      }
    }
  } catch (error) {
    Logger.error('Error editing player in roster:', error);
    await interaction.editReply(`Failed to edit player: ${(error as Error).message}`);
  }
}

// Handler for removing a player
async function handleRemovePlayer(interaction: ChatInputCommandInteraction, clanTag: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const discordUser = interaction.options.getUser('discord_user', true);
    
    // Get the clan ID
    const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
    if (!clan) {
      await interaction.editReply(`Error: Clan "${clanTag}" not found in configuration.`);
      return;
    }
    
    // Check if player exists
    const existingPlayer = await db.select()
      .from(players)
      .where(
        and(
          eq(players.discordId, discordUser.id),
          eq(players.clanId, clan.id.toString())
        )
      )
      .get();
    
    if (!existingPlayer) {
      await interaction.editReply(`Error: ${discordUser.tag} is not in the ${clanTag} roster.`);
      return;
    }
    
    // Request confirmation
    await interaction.editReply({
      content: `Are you sure you want to remove ${existingPlayer.username}${existingPlayer.clanTag ? ` [${existingPlayer.clanTag}]` : ''} from the ${clanTag} roster? This will delete ALL their data including ship statistics. Type "confirm" to proceed.`
    });
    
    // Create a message collector for confirmation
    // Check if the channel is a text channel first
    if (!interaction.channel || !('createMessageCollector' in interaction.channel)) {
      await interaction.followUp({
        content: `Error: Could not access the channel for confirmation.`,
        ephemeral: true
      });
      return;
    }
    
    // Get the text channel and type it correctly
    const channel = interaction.channel as TextChannel;
    
    // Create a message collector
    const filter = (m: any) => m.author.id === interaction.user.id && m.content.toLowerCase() === 'confirm';
    const collector = channel.createMessageCollector({ 
      filter, 
      max: 1, 
      time: 30000 // 30 seconds timeout
    });
    
    collector.on('collect', async () => {
      // Delete the player from the database
      await db.delete(players)
        .where(
          and(
            eq(players.discordId, discordUser.id),
            eq(players.clanId, clan.id.toString())
          )
        );
      
      await interaction.followUp({
        content: `${existingPlayer.username} has been removed from the ${clanTag} roster.`,
        ephemeral: true
      });
    });
    
    collector.on('end', async (collected) => {
      // If no messages were collected, it timed out
      if (collected.size === 0) {
        await interaction.followUp({
          content: `Removal cancelled: Confirmation timeout.`,
          ephemeral: true
        });
      }
    });
  } catch (error) {
    Logger.error('Error removing player from roster:', error);
    await interaction.followUp({
      content: `Failed to remove player: ${(error as Error).message}`,
      ephemeral: true
    });
  }
}

// Handler for listing the roster
async function handleListRoster(interaction: ChatInputCommandInteraction, clanTag: string): Promise<void> {
  await interaction.deferReply({ ephemeral: false });
  
  try {
    const detailed = interaction.options.getBoolean('detailed') || false;
    
    // Get the clan ID
    const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
    if (!clan) {
      await interaction.editReply(`Error: Clan "${clanTag}" not found in configuration.`);
      return;
    }
    
    // Get all players for this clan
    const allPlayers = await db.select()
      .from(players)
      .where(eq(players.clanId, clan.id.toString()))
      .all();
    
    if (allPlayers.length === 0) {
      await interaction.editReply(`The ${clanTag} roster is currently empty. Add players with \`/roster add clan:${clanTag}\`.`);
      return;
    }
    
    // Sort by name
    allPlayers.sort((a, b) => a.username.localeCompare(b.username));
    
    // Format response based on detail level
    let response = `**${clanTag} Roster (${allPlayers.length} players)**\n\n`;
    
    if (detailed) {
      // Detailed list with Discord user mentions and WG IDs
      for (const player of allPlayers) {
        const discordMention = `<@${player.discordId}>`;
        response += `- **${player.username}**${player.clanTag ? ` [${player.clanTag}]` : ''}\n`;
        response += `  Discord: ${discordMention}\n`;
        response += `  WG ID: \`${player.id}\`\n`;
        
        if (player.lastUpdated) {
          const date = new Date(player.lastUpdated);
          response += `  Last Updated: ${date.toLocaleDateString()}\n`;
        }
        
        response += '\n';
      }
    } else {
      // Simple list with just names and clan tags
      const playerList = allPlayers.map(p => 
        `- **${p.username}**${p.clanTag ? ` [${p.clanTag}]` : ''}`
      );
      response += playerList.join('\n');
    }
    
    await interaction.editReply(response);
  } catch (error) {
    Logger.error('Error listing roster:', error);
    await interaction.editReply(`Failed to list roster: ${(error as Error).message}`);
  }
}

// Handler for finding a player
async function handleFindPlayer(interaction: ChatInputCommandInteraction, clanTag: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const searchName = interaction.options.getString('name', true).toLowerCase();
    
    // Get the clan ID
    const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
    if (!clan) {
      await interaction.editReply(`Error: Clan "${clanTag}" not found in configuration.`);
      return;
    }
    
    // Find players with matching names (case insensitive)
    const allPlayers = await db.select()
      .from(players)
      .where(eq(players.clanId, clan.id.toString()))
      .all();
      
    const matchingPlayers = allPlayers.filter(p => 
      p.username.toLowerCase().includes(searchName)
    );
    
    if (matchingPlayers.length === 0) {
      await interaction.editReply(`No players found matching "${searchName}" in the ${clanTag} roster.`);
      return;
    }
    
    // Format response
    let response = `**Found ${matchingPlayers.length} player(s) matching "${searchName}" in ${clanTag}:**\n\n`;
    
    for (const player of matchingPlayers) {
      const discordMention = `<@${player.discordId}>`;
      response += `- **${player.username}**${player.clanTag ? ` [${player.clanTag}]` : ''}\n`;
      response += `  Discord: ${discordMention}\n`;
      response += `  WG ID: \`${player.id}\`\n\n`;
    }
    
    await interaction.editReply(response);
  } catch (error) {
    Logger.error('Error finding player:', error);
    await interaction.editReply(`Failed to find player: ${(error as Error).message}`);
  }
}