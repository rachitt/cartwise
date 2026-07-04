import { db, pool } from "./client.js";
import { chains } from "./schema.js";

const chainRows = [
  { slug: "kroger", name: "Kroger" },
  { slug: "target", name: "Target" },
  { slug: "walmart", name: "Walmart" },
  { slug: "aldi", name: "Aldi" },
] as const;

try {
  for (const chain of chainRows) {
    await db
      .insert(chains)
      .values(chain)
      .onConflictDoUpdate({
        target: chains.slug,
        set: { name: chain.name },
      });
  }
} finally {
  await pool.end();
}
