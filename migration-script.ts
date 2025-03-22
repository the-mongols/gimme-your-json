import { db } from "./src/database/db";
import fs from 'fs';

async function runMigration() {
  // Read the SQL file
  const sql = fs.readFileSync('./src/database/drizzle/0001_add_clan_battles.sql', 'utf-8');
  
  // Split into individual statements
  const statements = sql.split(';').filter(stmt => stmt.trim());
  
  // Execute each statement
  for (const statement of statements) {
    if (statement.trim()) {
      await db.run(statement);
    }
  }
  
  console.log('Migration completed successfully!');
}

runMigration().catch(console.error);