// Main entry point for Bun application


// Following to soon be deleted

import { db } from "./database/db";
import { sql } from "drizzle-orm";

const query = sql`select "hello world" as text`;
const result = db.get<{ text: string }>(query);
console.log(result);