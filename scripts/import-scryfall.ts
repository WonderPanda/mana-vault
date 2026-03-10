/**
 * Imports scryfall_card data from the seed file into the local D1 database.
 *
 * Usage: bun run scripts/import-scryfall.ts [--wait]
 *
 * Options:
 *   --wait  Poll until the D1 SQLite file exists (60s timeout).
 *           Useful when running as a post-start hook before the dev server
 *           has created the database.
 *
 * Reads from .data/scryfall-seed.sqlite (created by export-scryfall.ts).
 */

import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "fs";
import { resolve } from "path";

const TABLE = "scryfall_card";

const root = resolve(import.meta.dirname, "..");
const seedPath = resolve(root, ".data", "scryfall-seed.sqlite");
const d1ObjDir = resolve(root, ".alchemy", "miniflare", "v3", "d1", "miniflare-D1DatabaseObject");

const args = process.argv.slice(2);
const shouldWait = args.includes("--wait");

function findD1Database(): string | null {
  if (!existsSync(d1ObjDir)) return null;

  const sqliteFiles = readdirSync(d1ObjDir).filter((f) => f.endsWith(".sqlite"));
  if (sqliteFiles.length === 0) return null;

  return resolve(d1ObjDir, sqliteFiles[0]!);
}

async function waitForD1(timeoutMs = 60_000): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const path = findD1Database();
    if (path) return path;
    await Bun.sleep(2000);
  }

  throw new Error(`D1 database did not appear within ${timeoutMs / 1000}s`);
}

async function main() {
  if (!existsSync(seedPath)) {
    console.log("No seed file at .data/scryfall-seed.sqlite, skipping import.");
    return;
  }

  let d1Path: string;
  if (shouldWait) {
    console.log("Waiting for D1 database...");
    d1Path = await waitForD1();
    console.log("D1 database found.");
  } else {
    const found = findD1Database();
    if (!found) {
      throw new Error("No D1 database found. Start the dev server first, or use --wait to poll.");
    }
    d1Path = found;
  }

  const db = new Database(d1Path);

  // Skip if data already exists
  const existing = db.query(`SELECT COUNT(*) as count FROM ${TABLE}`).get() as {
    count: number;
  };

  if (existing.count > 0) {
    console.log(`Already has ${existing.count} scryfall cards, skipping.`);
    db.close();
    return;
  }

  // Attach seed and bulk-import
  db.exec(`ATTACH '${seedPath}' AS seed`);

  const seedCount = db.query(`SELECT COUNT(*) as count FROM seed.${TABLE}`).get() as {
    count: number;
  };
  console.log(`Importing ${seedCount.count} cards...`);

  db.exec(`INSERT OR REPLACE INTO ${TABLE} SELECT * FROM seed.${TABLE}`);
  db.exec("DETACH seed");
  db.close();

  console.log("Scryfall data imported successfully.");
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
