// check-tables.ts
import { Database } from "bun:sqlite";
import { join } from "path";

// Get project root and database path
const projectRoot = process.cwd();
const dbPath = join(projectRoot, "sqlite.db");
console.log(`Checking database at: ${dbPath}`);

interface TableInfo {
  name: string;
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

try {
  const sqlite = new Database(dbPath);
  
  // Get all tables
  const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type='table'").all() as TableInfo[];
  console.log("Tables in database:");
  console.table(tables);
  
  // Get all table structures
  for (const table of tables) {
    const name = table.name;
    console.log(`\nStructure of table: ${name}`);
    
    try {
      const structure = sqlite.query(`PRAGMA table_info(${name})`).all() as ColumnInfo[];
      console.table(structure);
    } catch (error) {
      console.error(`Error getting structure for table ${name}:`, error);
    }
  }
  
  // Close the database connection
  sqlite.close();
} catch (error) {
  console.error("Error checking tables:", error);
  process.exit(1);
}