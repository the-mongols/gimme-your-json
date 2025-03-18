import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
// Use the function import and a separate type-only import
import { generateOptimalLineup } from '../../../services/optimizer/lineup.js';
import type { TeamComposition, OptimalLineupResult, ShipWithScore } from '../../../services/optimizer/lineup.js';

export default {
  category: 'lineup',
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Generate an optimal team lineup from players in your voice channel')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('The game mode to optimize for')
        .setRequired(true)
        .addChoices(
          { name: 'Random', value: 'random' },
          { name: 'Ranked', value: 'ranked' },
          { name: 'Clan Battles', value: 'clan' },
          { name: 'Brawl', value: 'brawl' }
        )
    )
    .addBooleanOption(option =>
      option.setName('public')
        .setDescription('Make the result visible to everyone?')
        .setRequired(false)
    ),
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Check if the user is in a voice channel
    const member = interaction.member as GuildMember | null;
    if (!member || !member.voice.channel) {
      await interaction.reply({
        content: 'You need to be in a voice channel to use this command!',
        ephemeral: true
      });
      return;
    }
    
    // Get the game mode
    const mode = interaction.options.getString('mode', true);
    const isPublic = interaction.options.getBoolean('public') ?? false;
    
    await interaction.deferReply({ ephemeral: !isPublic });
    
    try {
      // Get all members in the voice channel
      const voiceChannel = member.voice.channel;
      const membersInVoice = Array.from(voiceChannel.members.values()).map(m => m.user.id);
      
      if (membersInVoice.length < 2) {
        await interaction.editReply('You need at least 2 players in the voice channel to generate a lineup.');
        return;
      }
      
      // Define the team composition based on mode
      const composition = getCompositionForMode(mode);
      
      // Generate the lineup
      const result = await generateOptimalLineup(membersInVoice, composition);
      
      // Create a nice embed with the results
      const embed = createLineupEmbed(result, mode, voiceChannel.name);
      
      await interaction.editReply({
        content: `Here's your optimal lineup for ${mode} mode:`,
        embeds: [embed]
      });
    } catch (error) {
      console.error('Error generating lineup:', error);
      await interaction.editReply({
        content: `Failed to generate lineup: ${(error as Error).message}`
      });
    }
  }
};

function getCompositionForMode(mode: string): TeamComposition {
  switch (mode) {
    case 'random':
      return {
        requiredTypes: { "DD": 2, "CA": 3, "BB": 2, "CV": 1 },
        minTier: 5,
        maxTier: 10
      };
    case 'ranked':
      return {
        requiredTypes: { "DD": 2, "CA": 2, "BB": 3 },
        minTier: 8,
        maxTier: 10,
        maxTierSpread: 1
      };
    case 'clan':
      return {
        requiredTypes: { "DD": 2, "CA": 2, "BB": 3 },
        minTier: 10,
        maxTier: 10
      };
    case 'brawl':
      return {
        requiredTypes: { "DD": 1, "CA": 1, "BB": 1 },
        minTier: 9,
        maxTier: 10
      };
    default:
      return {
        requiredTypes: { "DD": 2, "CA": 2, "BB": 3 },
        minTier: 8,
        maxTier: 10
      };
  }
}

function createLineupEmbed(result: OptimalLineupResult, mode: string, channelName: string): EmbedBuilder {
  const { ships, totalScore, averageTier, composition } = result;
  
  // Sort ships by type for display (DD, CA, BB, CV)
  const shipTypeOrder: Record<string, number> = { "DD": 1, "CA": 2, "BB": 3, "CV": 4, "SS": 5 };
  const sortedShips = [...ships].sort((a, b) => 
    (shipTypeOrder[a.type] || 99) - (shipTypeOrder[b.type] || 99)
  );
  
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle(`Optimal Lineup for ${mode.toUpperCase()}`)
    .setDescription(`Players from voice channel: ${channelName}`)
    .addFields(
      { name: 'Team Score', value: `${totalScore.toFixed(2)}`, inline: true },
      { name: 'Average Tier', value: `${averageTier.toFixed(1)}`, inline: true },
      { name: 'Ships', value: `${ships.length}`, inline: true }
    )
    .setTimestamp();
  
  // Group ships by type for cleaner display
  const shipsByType: Record<string, ShipWithScore[]> = {};
  for (const ship of sortedShips) {
    if (!shipsByType[ship.type]) {
      shipsByType[ship.type] = [];
    }
    shipsByType[ship.type].push(ship);
  }
  
  // Add each ship type as a field
  const sortedTypes = Object.keys(shipsByType).sort(
    (a, b) => (shipTypeOrder[a] || 99) - (shipTypeOrder[b] || 99)
  );
  
  for (const type of sortedTypes) {
    const typeShips = shipsByType[type];
    const typeData = typeShips.map(ship => 
      `**${ship.playerName}**: ${ship.name} (T${ship.tier}) - Score: ${ship.shipScore.toFixed(2)}`
    ).join('\n');
    
    embed.addFields({ 
      name: `${getShipTypeName(type)} (${typeShips.length})`, 
      value: typeData || 'No ships' 
    });
  }
  
  return embed;
}

function getShipTypeName(shortType: string): string {
  const typeNames: Record<string, string> = {
    "DD": "Destroyers",
    "CA": "Cruisers",
    "BB": "Battleships",
    "CV": "Aircraft Carriers",
    "SS": "Submarines"
  };
  
  return typeNames[shortType] || shortType;
}