import type { Config } from 'drizzle-kit';

export default {
  schema: './src/database/drizzle/schema.ts',
  out: './src/database/drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './sqlite.db'
  }
} satisfies Config;