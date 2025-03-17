// Player roster management commands
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { db } from '../../../database/db.js';
import { players } from '../../../database/drizzle/schema.js';
import { eq } from 'drizzle-orm';

// Fetch player data from WG API
import { fetchPlayerByName, fetchPlayerById } from '../../../services/wargaming/api.js';

// Main roster command with subcommands
export default {
  category: 'roster',
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('roster')
    .setDescription('Manage the player roster')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles) // Restrict to users with appropriate permissions
    
    // Add player subcommand
    .addSubcommand(subcommand =>
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
            .setDescription('Clan tag (optional)')
            .setRequired(false)))
    
    // Edit player subcommand
    .addSubcommand(subcommand =>
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
            .setDescription('New clan tag')
            .setRequired(false)))
    
    // Remove player subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a player from the roster')
        .addUserOption(option =>
          option.setName('discord_user')
            .setDescription('Discord user to remove')
            .setRequired(true)))
    
    // List roster subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all players in the roster')
        .addBooleanOption(option => 
          option.setName('detailed')
            .setDescription('Show detailed information')
            .setRequired(false)))
    
    // Find player subcommand (by in-game name)
    .addSubcommand(subcommand =>
      subcommand
        .setName('find')
        .setDescription('Find a player in the roster by name')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Player in-game name')
            .setRequired(true))),
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'add':
        return await handleAddPlayer(interaction);
      case 'edit':
        return await handleEditPlayer(interaction);
      case 'remove':
        return await handleRemovePlayer(interaction);
      case 'list':
        return await handleListRoster(interaction);
      case 'find':
        return await handleFindPlayer(interaction);
      default:
        await interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true
        });
    }
  }
};

// Handler for adding a player
async function handleAddPlayer(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const discordUser = interaction.options.getUser('discord_user', true);
    const playerId = interaction.options.getString('player_id', true);
    let playerName = interaction.options.getString('player_name') || null;
    let clanTag = interaction.options.getString('clan_tag') || null;
    
    // Check if player is already in the roster
    const existingPlayer = await db.select()
      .from(players)
      .where(eq(players.discordId, discordUser.id))
      .get();
    
    if (existingPlayer) {
      await interaction.editReply(`Error: ${discordUser.tag} is already in the roster with WG ID: ${existingPlayer.id}`);
      return;
    }
    
    // If player name wasn't provided, fetch it from the API
    if (!playerName) {
      try {
        const playerData = await fetchPlayerById(playerId);
        playerName = playerData.nickname;
        
        // If clan info is available and clan tag wasn't manually provided
        if (playerData.clan && !clanTag) {
          clanTag = playerData.clan.tag;
        }
      } catch (error) {
        await interaction.editReply(`Warning: Could not fetch player name from WG API. You'll need to provide it manually.`);
        return;
      }
    }
    
    if (!playerName) {
      await interaction.editReply(`Error: Player name is required. Either provide it manually or ensure the WG API is accessible.`);
      return;
    }
    
    // Insert the player into the database
    await db.insert(players).values({
      id: playerId,
      username: playerName,
      discordId: discordUser.id,
      clanTag: clanTag,
      lastUpdated: Date.now()
    });
    
    await interaction.editReply(`Successfully added ${playerName}${clanTag ? ` [${clanTag}]` : ''} to the roster!`);
    
    // Schedule an immediate data update for this player
    interaction.followUp({
      content: `Fetching data for ${playerName}... This may take a moment.`,
      ephemeral: true
    });
    
    // This would be an async operation to fetch and update player data
    // updatePlayerDataInDb(playerId)
    //   .then(() => interaction.followUp({
    //     content: `Data update complete for ${playerName}!`,
    //     ephemeral: true
    //   }))
    //   .catch(error => interaction.followUp({
    //     content: `Warning: Initial data fetch failed: ${error.message}`,
    //     ephemeral: true
    //   }));
    
  } catch (error) {
    console.error('Error adding player to roster:', error);
    await interaction.editReply(`Failed to add player: ${(error as Error).message}`);
  }
}

// Handler for editing a player
async function handleEditPlayer(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const discordUser = interaction.options.getUser('discord_user', true);
    const newPlayerId = interaction.options.getString('player_id');
    const newPlayerName = interaction.options.getString('player_name');
    const newClanTag = interaction.options.getString('clan_tag');
    
    // Check if player exists in the roster
    const existingPlayer = await db.select()
      .from(players)
      .where(eq(players.discordId, discordUser.id))
      .get();
    
    if (!existingPlayer) {
      await interaction.editReply(`Error: ${discordUser.tag} is not in the roster. Use \`/roster add\` to add them first.`);
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
      .where(eq(players.discordId, discordUser.id));
    
    await interaction.editReply(`Successfully updated ${discordUser.tag} in the roster!`);
    
  } catch (error) {
    console.error('Error editing player in roster:', error);
    await interaction.editReply(`Failed to edit player: ${(error as Error).message}`);
  }
}

// Handler for removing a player
async function handleRemovePlayer(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const discordUser = interaction.options.getUser('discord_user', true);
    
    // Check if player exists
    const existingPlayer = await db.select()
      .from(players)
      .where(eq(players.discordId, discordUser.id))
      .get();
    
    if (!existingPlayer) {
      await interaction.editReply(`Error: ${discordUser.tag} is not in the roster.`);
      return;
    }
    
    // Request confirmation
    await interaction.editReply({
      content: `Are you sure you want to remove ${existingPlayer.username}${existingPlayer.clanTag ? ` [${existingPlayer.clanTag}]` : ''} from the roster? This will delete ALL their data including ship statistics. Type "confirm" to proceed.`
    });
    
    // Create a message collector for confirmation
    const filter = (m: any) => m.author.id === interaction.user.id && m.content.toLowerCase() === 'confirm';
    const channel = await interaction.channel?.fetch();
    
    if (!channel) {
      await interaction.followUp({
        content: `Error: Could not access the channel for confirmation.`,
        ephemeral: true
      });
      return;
    }
    
    try {
      const collected = await channel.awaitMessages({ 
        filter, 
        max: 1, 
        time: 30000, 
        errors: ['time'] 
      });
      
      if (collected.size > 0) {
        // Delete the player from the database
        await db.delete(players)
          .where(eq(players.discordId, discordUser.id));
        
        await interaction.followUp({
          content: `${existingPlayer.username} has been removed from the roster.`,
          ephemeral: true
        });
      }
    } catch (e) {
      // Timeout occurred
      await interaction.followUp({
        content: `Removal cancelled: Confirmation timeout.`,
        ephemeral: true
      });
    }
    
  } catch (error) {
    console.error('Error removing player from roster:', error);
    await interaction.followUp({
      content: `Failed to remove player: ${(error as Error).message}`,
      ephemeral: true
    });
  }
}

// Handler for listing the roster
async function handleListRoster(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: false });
  
  try {
    const detailed = interaction.options.getBoolean('detailed') || false;
    
    // Get all players
    const allPlayers = await db.select().from(players).all();
    
    if (allPlayers.length === 0) {
      await interaction.editReply('The roster is currently empty. Add players with `/roster add`.');
      return;
    }
    
    // Sort by name
    allPlayers.sort((a, b) => a.username.localeCompare(b.username));
    
    // Format response based on detail level
    let response = `**Current Roster (${allPlayers.length} players)**\n\n`;
    
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
    console.error('Error listing roster:', error);
    await interaction.editReply(`Failed to list roster: ${(error as Error).message}`);
  }
}

// Handler for finding a player
async function handleFindPlayer(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const searchName = interaction.options.getString('name', true).toLowerCase();
    
    // Find players with matching names (case insensitive)
    const allPlayers = await db.select().from(players).all();
    const matchingPlayers = allPlayers.filter(p => 
      p.username.toLowerCase().includes(searchName)
    );
    
    if (matchingPlayers.length === 0) {
      await interaction.editReply(`No players found matching "${searchName}".`);
      return;
    }
    
    // Format response
    let response = `**Found ${matchingPlayers.length} player(s) matching "${searchName}":**\n\n`;
    
    for (const player of matchingPlayers) {
      const discordMention = `<@${player.discordId}>`;
      response += `- **${player.username}**${player.clanTag ? ` [${player.clanTag}]` : ''}\n`;
      response += `  Discord: ${discordMention}\n`;
      response += `  WG ID: \`${player.id}\`\n\n`;
    }
    
    await interaction.editReply(response);
    
  } catch (error) {
    console.error('Error finding player:', error);
    await interaction.editReply(`Failed to find player: ${(error as Error).message}`);
  }
}