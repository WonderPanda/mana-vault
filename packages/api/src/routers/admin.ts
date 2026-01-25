import { JSONParser } from "@streamparser/json-whatwg";
import { db } from "@mana-vault/db";
import { scryfallCard } from "@mana-vault/db/schema/app";
import { sql } from "drizzle-orm";
import z from "zod";

import { adminProcedure, protectedProcedure } from "../index";
import type { ScryfallCardResponse } from "../lib/scryfall";
import { getCardImageUri } from "../lib/scryfall";

const ADMIN_EMAIL = "jesse@thecarters.cloud";

/** Headers required by Scryfall API */
const SCRYFALL_HEADERS = {
  "User-Agent": "ManaVault/1.0",
  Accept: "application/json",
};

/**
 * Scryfall bulk data types available from their API
 */
const BULK_DATA_TYPES = {
  oracle_cards: "Oracle Cards (~170MB) - One card per Oracle ID, most recognizable versions",
  unique_artwork: "Unique Artwork (~240MB) - All unique artworks with best scans",
  default_cards: "Default Cards (~525MB) - Every card in English or printed language",
  all_cards: "All Cards (~2.5GB) - Every card in every language",
} as const;

type BulkDataType = keyof typeof BULK_DATA_TYPES;

/**
 * Scryfall bulk data card format (same as API response)
 */
interface ScryfallBulkCard extends ScryfallCardResponse {
  lang?: string;
  released_at?: string;
  layout?: string;
}

/**
 * Scryfall bulk data API response
 */
interface ScryfallBulkDataResponse {
  object: string;
  has_more: boolean;
  data: Array<{
    object: string;
    id: string;
    type: string;
    updated_at: string;
    uri: string;
    name: string;
    description: string;
    size: number;
    download_uri: string;
    content_type: string;
    content_encoding: string;
  }>;
}

export const adminRouter = {
  /**
   * Check if the current user is an admin
   */
  isAdmin: protectedProcedure.handler(({ context }) => {
    return context.session.user.email === ADMIN_EMAIL;
  }),

  /**
   * Get stats about the scryfall_card table
   */
  getScryfallStats: adminProcedure.handler(async () => {
    const [stats] = await db
      .select({
        totalCards: sql<number>`count(*)`,
        uniqueSets: sql<number>`count(distinct ${scryfallCard.setCode})`,
        cardsWithImages: sql<number>`count(case when ${scryfallCard.imageUri} is not null then 1 end)`,
      })
      .from(scryfallCard);

    return stats ?? { totalCards: 0, uniqueSets: 0, cardsWithImages: 0 };
  }),

  /**
   * Get available Scryfall bulk data options
   */
  getBulkDataOptions: adminProcedure.handler(async () => {
    // Fetch the bulk data manifest from Scryfall
    const response = await fetch("https://api.scryfall.com/bulk-data", {
      headers: SCRYFALL_HEADERS,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch bulk data manifest: ${response.status}`);
    }

    const manifest = (await response.json()) as ScryfallBulkDataResponse;

    // Return relevant info for each bulk data type
    return manifest.data
      .filter((item) => item.type in BULK_DATA_TYPES)
      .map((item) => ({
        type: item.type as BulkDataType,
        name: item.name,
        description: item.description,
        size: item.size,
        sizeFormatted: formatBytes(item.size),
        updatedAt: item.updated_at,
        downloadUri: item.download_uri,
      }));
  }),

  /**
   * Stream and import Scryfall bulk data directly from their servers.
   * This streams the JSON data and processes cards in batches to handle
   * multi-gigabyte files without running out of memory.
   */
  streamImportScryfall: adminProcedure
    .input(
      z.object({
        /** Which bulk data type to import */
        bulkDataType: z.enum(["oracle_cards", "unique_artwork", "default_cards", "all_cards"]),
        /** Only include English cards (only applicable for all_cards) */
        englishOnly: z.boolean().default(true),
      }),
    )
    .handler(async ({ input }) => {
      // First, get the download URL from Scryfall's bulk data API
      const manifestResponse = await fetch("https://api.scryfall.com/bulk-data", {
        headers: SCRYFALL_HEADERS,
      });
      if (!manifestResponse.ok) {
        throw new Error(`Failed to fetch bulk data manifest: ${manifestResponse.status}`);
      }

      const manifest = (await manifestResponse.json()) as ScryfallBulkDataResponse;
      const bulkData = manifest.data.find((item) => item.type === input.bulkDataType);

      if (!bulkData) {
        throw new Error(`Bulk data type '${input.bulkDataType}' not found`);
      }

      // Fetch the bulk data file (Scryfall serves it gzipped, fetch auto-decompresses)
      // Note: The data files at *.scryfall.io don't require the same headers as the API
      const dataResponse = await fetch(bulkData.download_uri, {
        headers: SCRYFALL_HEADERS,
      });
      if (!dataResponse.ok) {
        throw new Error(`Failed to fetch bulk data: ${dataResponse.status}`);
      }

      if (!dataResponse.body) {
        throw new Error("No response body from bulk data download");
      }

      // Set up streaming JSON parser - parse each item in the root array
      const parser = new JSONParser({ paths: ["$.*"] });

      // Process cards in batches
      // D1/SQLite has a limit on SQL variables per query
      // The upsert with onConflictDoUpdate doubles the variables (insert + update set)
      // With 16 columns per card × 2 = 32 variables per card
      // Using batch size of 10 to stay well under limits
      const BATCH_SIZE = 10;
      let batch: ScryfallBulkCard[] = [];
      let totalProcessed = 0;
      let totalInserted = 0;
      let totalSkipped = 0;
      let batchNumber = 0;
      const startTime = Date.now();

      console.log(`[Scryfall Import] Starting import of ${input.bulkDataType}...`);

      const reader = dataResponse.body.pipeThrough(parser).getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const card = value.value as unknown as ScryfallBulkCard;

        // Filter based on options
        if (input.englishOnly && card.lang !== "en") {
          totalSkipped++;
          continue;
        }

        // Skip cards without required fields
        if (!card.id || !card.oracle_id || !card.name || !card.set || !card.set_name) {
          totalSkipped++;
          continue;
        }

        batch.push(card);

        // Process batch when it reaches the threshold
        if (batch.length >= BATCH_SIZE) {
          batchNumber++;
          const batchStart = Date.now();
          const inserted = await processBatch(batch);
          const batchMs = Date.now() - batchStart;
          totalInserted += inserted;
          totalProcessed += batch.length;
          // Log every 1000 cards (every 50 batches at size 20) to avoid spam
          if (batchNumber % 50 === 0) {
            const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(
              `[Scryfall Import] Batch ${batchNumber}: Processed ${totalProcessed.toLocaleString()} cards (${totalInserted.toLocaleString()} inserted, ${totalSkipped.toLocaleString()} skipped) [batch: ${batchMs}ms, elapsed: ${elapsedSec}s]`,
            );
          }
          batch = [];
        }
      }

      // Process remaining cards in the final batch
      if (batch.length > 0) {
        batchNumber++;
        const batchStart = Date.now();
        const inserted = await processBatch(batch);
        const batchMs = Date.now() - batchStart;
        totalInserted += inserted;
        totalProcessed += batch.length;
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          `[Scryfall Import] Batch ${batchNumber} (final): Processed ${totalProcessed.toLocaleString()} cards (${totalInserted.toLocaleString()} inserted, ${totalSkipped.toLocaleString()} skipped) [batch: ${batchMs}ms, elapsed: ${elapsedSec}s]`,
        );
      }

      const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
      const cardsPerSecond = (totalProcessed / ((Date.now() - startTime) / 1000)).toFixed(0);

      console.log(
        `[Scryfall Import] Complete! Total: ${totalProcessed.toLocaleString()} processed, ${totalInserted.toLocaleString()} inserted, ${totalSkipped.toLocaleString()} skipped in ${elapsedSeconds}s (${cardsPerSecond} cards/sec)`,
      );

      return {
        bulkDataType: input.bulkDataType,
        totalProcessed,
        totalInserted,
        totalSkipped,
        message: `Successfully imported ${totalInserted} cards from ${bulkData.name}`,
      };
    }),

  /**
   * Clear all scryfall cards (use with caution!)
   */
  clearScryfallCards: adminProcedure.handler(async () => {
    // This will fail if there are foreign key references
    // which is intentional - don't delete cards that are in use
    try {
      await db.delete(scryfallCard);
      return {
        success: true,
        message: "All scryfall cards cleared",
      };
    } catch {
      return {
        success: false,
        message:
          "Cannot clear cards - some cards are referenced by collection cards or other tables",
      };
    }
  }),
};

/**
 * Process a batch of cards and insert/update them in the database
 */
async function processBatch(cards: ScryfallBulkCard[]): Promise<number> {
  const values = cards.map((card) => ({
    id: card.id,
    oracleId: card.oracle_id,
    name: card.name,
    setCode: card.set,
    setName: card.set_name,
    collectorNumber: card.collector_number || "0",
    rarity: card.rarity || "common",
    manaCost: card.mana_cost ?? null,
    cmc: card.cmc ?? null,
    typeLine: card.type_line ?? null,
    oracleText: card.oracle_text ?? null,
    colors: card.colors ? JSON.stringify(card.colors) : null,
    colorIdentity: card.color_identity ? JSON.stringify(card.color_identity) : null,
    imageUri: getCardImageUri(card),
    scryfallUri: card.scryfall_uri ?? null,
    dataJson: JSON.stringify(card),
  }));

  await db
    .insert(scryfallCard)
    .values(values)
    .onConflictDoUpdate({
      target: scryfallCard.id,
      set: {
        oracleId: sql`excluded.oracle_id`,
        name: sql`excluded.name`,
        setCode: sql`excluded.set_code`,
        setName: sql`excluded.set_name`,
        collectorNumber: sql`excluded.collector_number`,
        rarity: sql`excluded.rarity`,
        manaCost: sql`excluded.mana_cost`,
        cmc: sql`excluded.cmc`,
        typeLine: sql`excluded.type_line`,
        oracleText: sql`excluded.oracle_text`,
        colors: sql`excluded.colors`,
        colorIdentity: sql`excluded.color_identity`,
        imageUri: sql`excluded.image_uri`,
        scryfallUri: sql`excluded.scryfall_uri`,
        dataJson: sql`excluded.data_json`,
        updatedAt: sql`(cast(unixepoch('subsecond') * 1000 as integer))`,
      },
    });

  return values.length;
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
