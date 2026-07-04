import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://localhost:5432/cartwise",
});

export const db = drizzle(pool, { schema });
