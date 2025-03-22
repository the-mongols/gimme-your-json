// check-tables.ts
import { Database } from "bun:sqlite";

const sqlite = new Database("sqlite.db");
const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables);