/**
 * Exports the scryfall_card table from the local D1 database to a portable
 * SQLite seed file.
 *
 * Usage: bun run scripts/export-scryfall.ts
 *
 * The seed file is written to .data/scryfall-seed.sqlite (gitignored).
 * It gets copied to new worktrees via `wt step copy-ignored`.
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { resolve } from "path";

const TABLE = "scryfall_card";

const root = resolve(import.meta.dirname, "..");
const seedPath = resolve(root, ".data", "scryfall-seed.sqlite");

function findD1Database(): string {
  const d1ObjDir = resolve(root, ".alchemy", "miniflare", "v3", "d1", "miniflare-D1DatabaseObject");

  if (!existsSync(d1ObjDir)) {
    throw new Error(
      "No .alchemy/miniflare D1 directory found. Has the dev server been started at least once?",
    );
  }

  const sqliteFiles = readdirSync(d1ObjDir).filter((f) => f.endsWith(".sqlite"));

  if (sqliteFiles.length === 0) {
    throw new Error("No D1 database found in .alchemy/miniflare/v3/d1/");
  }
  if (sqliteFiles.length > 1) {
    console.warn(`Multiple D1 databases found, using first: ${sqliteFiles[0]}`);
  }

  return resolve(d1ObjDir, sqliteFiles[0]!);
}

const d1Path = findD1Database();
console.log(`Source D1 database: ${d1Path}`);

mkdirSync(resolve(root, ".data"), { recursive: true });

if (existsSync(seedPath)) {
  unlinkSync(seedPath);
}

const source = new Database(d1Path, { readonly: true });
const seed = new Database(seedPath);

// Create table from source schema
const tableSchema = source
  .query("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?")
  .get(TABLE) as { sql: string } | null;

if (!tableSchema) {
  throw new Error(`Table ${TABLE} not found in source database.`);
}

seed.exec(tableSchema.sql);

// Copy indexes
const indexes = source
  .query("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name = ? AND sql IS NOT NULL")
  .all(TABLE) as { sql: string }[];

for (const idx of indexes) {
  seed.exec(idx.sql);
}

// Attach source and bulk-copy
const count = source.query(`SELECT COUNT(*) as count FROM ${TABLE}`).get() as {
  count: number;
};
console.log(`Copying ${count.count} cards...`);

seed.exec(`ATTACH '${d1Path}' AS source`);
seed.exec(`INSERT INTO ${TABLE} SELECT * FROM source.${TABLE}`);
seed.exec("DETACH source");

seed.close();
source.close();

const sizeMB = (Bun.file(seedPath).size / (1024 * 1024)).toFixed(1);
console.log(`Seed file created: ${seedPath} (${sizeMB} MB)`);
