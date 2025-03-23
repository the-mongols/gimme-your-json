import { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { db } from '../../../database/db.js';
import { players } from '../../../database/drizzle/schema.js';
import { eq } from 'drizzle-orm';

// Simple CSV parser function to avoid dependency on Papa
function parseCSV(text: string): string[][] {
  const lines = text.split('\n');
  return lines.map(line => {
    // Handle quoted values with commas inside them
    const result = [];
    let inQuote = false;
    let current = '';
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last field
    result.push(current);
    return result;
  });
}

export default {
  category: 'roster',
  cooldown: 10,
  data: new SlashCommandBuilder()
    .setName('roster-import')
    .setDescription('Bulk import players from CSV file')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Restrict to admins
    .addAttachmentOption(option =>
      option.setName('csv_file')
        .setDescription('CSV file with player data (discord_id,player_id,player_name,clan_tag)')
        .setRequired(true))
    .addBooleanOption(option =>
      option.setName('skip_first_row')
        .setDescription('Skip first row (headers)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('dry_run')
        .setDescription('Test import without saving data')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const csvFile = interaction.options.getAttachment('csv_file', true);
      const skipFirstRow = interaction.options.getBoolean('skip_first_row') ?? true;
      const dryRun = interaction.options.getBoolean('dry_run') ?? false;
      
      // Validate CSV file
      if (!csvFile.contentType?.includes('csv') && !csvFile.name.endsWith('.csv')) {
        await interaction.editReply('Error: Please upload a valid CSV file.');
        return;
      }
      
      if (csvFile.size > 1024 * 1024) { // 1MB max
        await interaction.editReply('Error: File size is too large. Maximum 1MB allowed.');
        return;
      }
      
      // Download CSV content
      const response = await fetch(csvFile.url);
      if (!response.ok) {
        await interaction.editReply(`Error: Could not download CSV file (${response.status}).`);
        return;
      }
      
      const csvContent = await response.text();
      
      // Parse CSV using our simple parser
      const rows = parseCSV(csvContent);
      
      // Skip first row if requested
      const dataRows = skipFirstRow && rows.length > 0 ? rows.slice(1) : rows;
      
      // Validate rows
      if (dataRows.length === 0) {
        await interaction.editReply('Error: CSV file is empty or has no valid data rows.');
        return;
      }
      
      // Process rows
      const results = {
        total: dataRows.length,
        valid: 0,
        invalid: 0,
        duplicates: 0,
        success: 0,
        errors: [] as string[]
      };
      
      const validRows = [];
      
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNum = skipFirstRow ? i + 2 : i + 1;
        
        // Check minimum columns
        if (row.length < 3) {
          results.invalid++;
          results.errors.push(`Row ${rowNum}: Not enough columns (need discord_id, player_id, player_name)`);
          continue;
        }
        
        const [discordId, playerId, playerName, clanTag = ''] = row.map(cell => cell.trim());
        
        // Validate Discord ID
        if (!/^\d{17,20}$/.test(discordId)) {
          results.invalid++;
          results.errors.push(`Row ${rowNum}: Invalid Discord ID format (${discordId})`);
          continue;
        }
        
        // Validate Player ID
        if (!/^\d+$/.test(playerId)) {
          results.invalid++;
          results.errors.push(`Row ${rowNum}: Invalid WG Player ID format (${playerId})`);
          continue;
        }
        
        // Check for existing player by Discord ID
        const existingByDiscord = await db.select()
          .from(players)
          .where(eq(players.discordId, discordId))
          .get();
        
        if (existingByDiscord) {
          results.duplicates++;
          results.errors.push(`Row ${rowNum}: Discord ID ${discordId} already in roster as ${existingByDiscord.username}`);
          continue;
        }
        
        // Check for existing player by WG ID
        const existingByWG = await db.select()
          .from(players)
          .where(eq(players.id, playerId))
          .get();
        
        if (existingByWG) {
          results.duplicates++;
          results.errors.push(`Row ${rowNum}: WG ID ${playerId} already in roster as ${existingByWG.username}`);
          continue;
        }
        
        results.valid++;
        validRows.push({
          id: playerId,
          clanId: "1000072593", // Default clan ID
          username: playerName,
          discordId: discordId,
          clanTag: clanTag || null,
          lastUpdated: Date.now()
        });
      }
      
      // In dry run mode, just report what would happen
      if (dryRun) {
        const report = `
## Roster Import Dry Run Results

- **Total rows**: ${results.total}
- **Valid entries**: ${results.valid}
- **Invalid entries**: ${results.invalid}
- **Duplicates**: ${results.duplicates}

${results.errors.length > 0 ? '### Errors\n' + results.errors.join('\n') : ''}

**This was a dry run. No data was imported.**
To actually import the data, run the command without the dry_run option.
`;
        
        await interaction.editReply({
          content: 'Dry run completed. Here is the report:',
          files: [new AttachmentBuilder(Buffer.from(report), { name: 'import-dry-run.md' })]
        });
        return;
      }
      
      // Actually import the data if not dry run
      if (validRows.length > 0) {
        await db.insert(players).values(validRows);
        results.success = validRows.length;
      }
      
      // Generate final report
      const report = `
## Roster Import Results

- **Total rows**: ${results.total}
- **Successfully imported**: ${results.success}
- **Invalid entries**: ${results.invalid}
- **Duplicates**: ${results.duplicates}

${results.errors.length > 0 ? '### Errors\n' + results.errors.join('\n') : ''}
`;
      
      await interaction.editReply({
        content: `Import completed! ${results.success} player(s) added to the roster.`,
        files: [new AttachmentBuilder(Buffer.from(report), { name: 'import-results.md' })]
      });
      
    } catch (error) {
      console.error('Error importing roster:', error);
      await interaction.editReply(`Failed to import roster: ${(error as Error).message}`);
    }
  }
};