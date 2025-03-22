// ./src/utils -> Helper functions & utilities

// Centralized configuration loading

/**
 * Central configuration module for accessing environment variables
 */
export const Config = {
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID,
    token: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
  },
  wargaming: {
    apiKey: process.env.WG_API_KEY,
    region: process.env.WG_API_REGION || 'na',
    cookies: process.env.WOWS_COOKIES,
  },
  google: {
    sheetId: process.env.GOOGLE_SHEET_ID,
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  database: {
    path: './sqlite.db',
  },
  scheduler: {
    updateHour: parseInt(process.env.UPDATE_HOUR || '0', 10),
    updateMinute: parseInt(process.env.UPDATE_MINUTE || '0', 10),
  },
  clan: {
    tag: 'PN31',
    id: 1000072593, // Replace with env var when available
  }
};