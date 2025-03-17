import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

// Define interface for the API response based on your example JSON
interface Player {
    survived: boolean;
    nickname: string;
    result_id: number;
    name: string;
    ship: {
        level: number;
        name: string;
        icons: {
            dead: string;
            alive: string;
        };
    };
    vehicle_id: number;
    spa_id: number;
    clan_id: number;
}

interface Team {
    result: string;
    stage: any;
    players: Player[];
    division?: number;
    league?: number;
    division_rating?: number;
    team_number?: number;
    rating_delta?: number;
    id?: number;
    clan_id?: number;
    claninfo?: {
        members_count: number;
        realm: string;
        disbanded: boolean;
        hex_color: string;
        tag: string;
        name: string;
        id: number;
        color: string;
    };
}

interface Battle {
    cluster_id: number;
    finished_at: string;
    realm: string;
    season_number: number;
    map_id: number;
    map: {
        name: string;
    };
    arena_id: number;
    id: number;
    teams: Team[];
}

interface ApiResponse {
    [index: number]: Battle;
}

const wowsBattlesCommand = {
    category: 'api',
    cooldown: 10,
    data: new SlashCommandBuilder()
        .setName('wows-battles')
        .setDescription('Fetches World of Warships battle data and returns as a JSON file'),
    
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply(); // Use deferReply for operations that might take longer than 3 seconds
        
        try {
            console.log('Fetching WoWS battle data...');
            
            // Authentication cookies needed for the request
            // First try to get cookies from environment variables for better security
            const wowsCookies = process.env.WOWS_COOKIES;
            
            let cookieString = '';
            
            if (wowsCookies) {
                // Use the environment variable if available
                cookieString = wowsCookies;
                console.log('Using WoWS cookies from environment variables');
            } else {
                // Fallback to hardcoded cookies if environment variable is not set
                console.log('Using fallback hardcoded WoWS cookies - consider using environment variables for security');
                const cookies = {
                    'wowsp_csrftoken': 'Z6gREonpoM8d9spBX4NXiJ2ktPb8LDdI9mAuXqDTm92lyYG7DLuGkr9yvtmZIZGM',
                    'client_region': 'us;http://worldofwarships.com',
                    'wsauth_token': 'UmbJrffO0eLrdnQ1WBs4HKfmhd3NCMUXTlQuMKU4neOPQiA93PmTojsbeb8oXlJS',
                    'wsauth_presence': '1',
                    'hllang': 'en',
                    'user_lang': 'en',
                    'wsclans_hllang': 'en',
                    'cm.options.user_id': '1013529433',
                    'cm.options.user_name': 'The_Mongols',
                    'OptanonConsent': 'isGpcEnabled=1&datestamp=Tue+Feb+25+2025+03%3A38%3A42+GMT-0500+(Eastern+Standard+Time)&version=202501.2.0&hosts=&groups=C0001%3A1%2CC0003%3A1%2CC0004%3A0%2CC0002%3A1&consentId=48666d03-e7f3-454c-b40a-864712009334'
                };
                
                // Convert cookies object to cookie header string
                cookieString = Object.entries(cookies)
                    .map(([key, value]) => `${key}=${value}`)
                    .join('; ');
            }
            
            // Make the request with cookies
            const response = await fetch('https://clans.worldofwarships.com/api/ladder/battles/?team=1', {
                headers: {
                    'Cookie': cookieString,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
                }
            });
            
            if (!response.ok) {
                throw new Error(`API responded with status: ${response.status}`);
            }
            
            // Get the JSON data
            const data = await response.json();
            
            // Convert the data to a formatted JSON string
            const jsonString = JSON.stringify(data, null, 2);
            
            // Create a buffer from the JSON string
            const buffer = Buffer.from(jsonString, 'utf-8');
            
            // Create an attachment with the JSON data
            const attachment = new AttachmentBuilder(buffer, { name: 'wows-battles.json' });
            
            // Send the JSON file as an attachment
            await interaction.editReply({
                content: 'Here is the World of Warships battle data:',
                files: [attachment]
            });
            
            console.log('Successfully sent WoWS battle data as JSON file');
            
        } catch (error) {
            console.error('Error fetching WoWS battle data:', error);
            await interaction.editReply({
                content: `Failed to fetch battle data: ${(error as Error).message}`
            });
        }
    },
};

// Export both as named export and default export
export { wowsBattlesCommand };
export default wowsBattlesCommand;