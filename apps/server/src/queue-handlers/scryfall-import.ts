import { JSONParser } from "@streamparser/json-whatwg";
import { db } from "@mana-vault/db";
import { scryfallCard, scryfallImportChunk } from "@mana-vault/db/schema/app";
import { eq, sql } from "drizzle-orm";

import type {
  ScryfallCardInsertData,
  ScryfallImportMessage,
  ScryfallInsertBatchMessage,
} from "@mana-vault/api/types/queue-messages";

/** Headers required by Scryfall API */
const SCRYFALL_HEADERS = {
  "User-Agent": "ManaVault/1.0",
  Accept: "application/json",
};

/**
 * Scryfall card response type (partial - only fields we care about)
 */
interface ScryfallCardResponse {
  id: string;
  oracle_id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    png?: string;
    art_crop?: string;
    border_crop?: string;
  };
  card_faces?: Array<{
    image_uris?: {
      small?: string;
      normal?: string;
      large?: string;
    };
  }>;
  scryfall_uri?: string;
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    usd_etched?: string | null;
  };
  lang?: string;
}

/**
 * Get the best image URI for a card (handles double-faced cards)
 */
function getCardImageUri(card: ScryfallCardResponse): string | null {
  if (card.image_uris?.normal) {
    return card.image_uris.normal;
  }
  if (card.card_faces?.[0]?.image_uris?.normal) {
    return card.card_faces[0].image_uris.normal;
  }
  return null;
}

/**
 * Transform a Scryfall card response into the format needed for database insertion
 */
function transformCardForInsert(card: ScryfallCardResponse): ScryfallCardInsertData {
  return {
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    set_code: card.set,
    set_name: card.set_name,
    collector_number: card.collector_number || "0",
    rarity: card.rarity || "common",
    mana_cost: card.mana_cost ?? null,
    cmc: card.cmc ?? null,
    type_line: card.type_line ?? null,
    oracle_text: card.oracle_text ?? null,
    colors: card.colors ? JSON.stringify(card.colors) : null,
    color_identity: card.color_identity ? JSON.stringify(card.color_identity) : null,
    image_uri: getCardImageUri(card),
    scryfall_uri: card.scryfall_uri ?? null,
    price_usd: card.prices?.usd ? Number.parseFloat(card.prices.usd) : null,
    price_usd_foil: card.prices?.usd_foil ? Number.parseFloat(card.prices.usd_foil) : null,
    price_usd_etched: card.prices?.usd_etched ? Number.parseFloat(card.prices.usd_etched) : null,
    data_json: JSON.stringify(card),
  };
}

/**
 * Insert a chunk of cards into the database using json_each.
 * Uses only 1 bound variable regardless of chunk size.
 */
async function insertChunk(cards: ScryfallCardInsertData[]): Promise<number> {
  const jsonData = JSON.stringify(cards);

  await db.run(sql`
    INSERT OR REPLACE INTO ${scryfallCard} (
      id,
      oracle_id,
      name,
      set_code,
      set_name,
      collector_number,
      rarity,
      mana_cost,
      cmc,
      type_line,
      oracle_text,
      colors,
      color_identity,
      image_uri,
      scryfall_uri,
      price_usd,
      price_usd_foil,
      price_usd_etched,
      data_json,
      created_at,
      updated_at
    )
    SELECT
      json_extract(value, '$.id'),
      json_extract(value, '$.oracle_id'),
      json_extract(value, '$.name'),
      json_extract(value, '$.set_code'),
      json_extract(value, '$.set_name'),
      json_extract(value, '$.collector_number'),
      json_extract(value, '$.rarity'),
      json_extract(value, '$.mana_cost'),
      json_extract(value, '$.cmc'),
      json_extract(value, '$.type_line'),
      json_extract(value, '$.oracle_text'),
      json_extract(value, '$.colors'),
      json_extract(value, '$.color_identity'),
      json_extract(value, '$.image_uri'),
      json_extract(value, '$.scryfall_uri'),
      json_extract(value, '$.price_usd'),
      json_extract(value, '$.price_usd_foil'),
      json_extract(value, '$.price_usd_etched'),
      json_extract(value, '$.data_json'),
      COALESCE(
        (SELECT created_at FROM ${scryfallCard} sc WHERE sc.id = json_extract(value, '$.id')),
        cast(unixepoch('subsecond') * 1000 as integer)
      ),
      cast(unixepoch('subsecond') * 1000 as integer)
    FROM json_each(${jsonData})
  `);

  return cards.length;
}

// =============================================================================
// Stage 1: Parse & Dispatch Handler
// =============================================================================

/**
 * Handle a scryfall import job from the queue (Stage 1: Parse & Dispatch).
 *
 * This handler:
 * 1. Downloads the bulk data file from Scryfall to R2 (if not already cached)
 * 2. Streams and parses the JSON from R2
 * 3. Writes batches of 1000 cards to R2 as separate files
 * 4. Dispatches queue messages with R2 keys for parallel insert processing
 *
 * The R2 files are kept after processing for potential retries.
 */
export async function handleScryfallImport(
  message: ScryfallImportMessage,
  r2Bucket: R2Bucket,
  insertQueue: Queue<ScryfallInsertBatchMessage>,
): Promise<void> {
  const { bulkDataType, englishOnly, downloadUri, forceReprocess } = message;
  // Derive a unique source name from the download URI filename
  // e.g. "https://data.scryfall.io/default-cards/default-cards-20260129100712.json"
  //    → "default-cards-20260129100712"
  const sourceFileName =
    downloadUri
      .split("/")
      .pop()
      ?.replace(/\.json$/, "") ?? bulkDataType;
  const bulkDataKey = `bulk-data/${sourceFileName}.json`;
  const batchPrefix = `batches/${sourceFileName}`;

  console.log(`[Scryfall Parse] Starting parse job for ${bulkDataType}...`);
  console.log(`[Scryfall Parse] Download URI: ${downloadUri}`);
  console.log(`[Scryfall Parse] English only: ${englishOnly}`);

  const startTime = Date.now();

  // Step 1: Check if file already exists in R2, otherwise download
  let downloadMs = 0;
  const existingObject = forceReprocess ? null : await r2Bucket.head(bulkDataKey);

  if (existingObject) {
    console.log(
      `[Scryfall Parse] Found existing R2 file (${(existingObject.size / 1024 / 1024).toFixed(1)}MB), skipping download`,
    );
  } else {
    console.log(`[Scryfall Parse] Downloading to R2 bucket...`);
    const downloadStart = Date.now();

    const downloadResponse = await fetch(downloadUri, {
      headers: SCRYFALL_HEADERS,
    });

    if (!downloadResponse.ok) {
      throw new Error(`Failed to fetch bulk data: ${downloadResponse.status}`);
    }

    if (!downloadResponse.body) {
      throw new Error("No response body from bulk data download");
    }

    // Stream directly to R2
    await r2Bucket.put(bulkDataKey, downloadResponse.body, {
      httpMetadata: {
        contentType: "application/json",
      },
    });

    downloadMs = Date.now() - downloadStart;
    console.log(`[Scryfall Parse] Downloaded to R2 in ${(downloadMs / 1000).toFixed(1)}s`);
  }

  // Step 2: Parse from R2, write batches to R2, and dispatch queue messages
  console.log(`[Scryfall Parse] Parsing and writing batches to R2...`);
  const parseStart = Date.now();

  const r2Object = await r2Bucket.get(bulkDataKey);
  if (!r2Object) {
    throw new Error(`Failed to read bulk data from R2: ${bulkDataKey}`);
  }

  // Set up streaming JSON parser
  // keepStack: false prevents keeping the entire parent array in memory
  const parser = new JSONParser({ paths: ["$.*"], keepStack: false });

  // Accumulate cards into batches of 1000 before writing to R2
  const BATCH_SIZE = 1000;
  let batch: ScryfallCardInsertData[] = [];
  let totalParsed = 0;
  let totalSkipped = 0;
  let batchNumber = 0;

  const reader = r2Object.body.pipeThrough(parser).getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const card = (value as { value: unknown }).value as ScryfallCardResponse;

    // Filter based on options
    if (englishOnly && card.lang !== "en") {
      totalSkipped++;
      continue;
    }

    // Skip cards without required fields
    if (!card.id || !card.oracle_id || !card.name || !card.set || !card.set_name) {
      totalSkipped++;
      continue;
    }

    // Transform and add to batch
    batch.push(transformCardForInsert(card));
    totalParsed++;

    // Write batch to R2 and dispatch queue message when batch is full
    if (batch.length >= BATCH_SIZE) {
      batchNumber++;
      const r2Key = `${batchPrefix}/batch-${batchNumber.toString().padStart(5, "0")}.json`;

      // Check if batch file already exists in R2 (idempotency for parse stage)
      const existingBatch = forceReprocess ? null : await r2Bucket.head(r2Key);
      if (existingBatch) {
        console.log(
          `[Scryfall Parse] Batch ${batchNumber} already exists in R2 (${(existingBatch.size / 1024).toFixed(1)}KB), skipping upload`,
        );
      } else {
        const batchJson = JSON.stringify(batch);
        console.log(
          `[Scryfall Parse] Uploading batch ${batchNumber} to R2: ${r2Key} (${(batchJson.length / 1024).toFixed(1)}KB)`,
        );
        await r2Bucket.put(r2Key, batchJson, {
          httpMetadata: { contentType: "application/json" },
        });
        console.log(`[Scryfall Parse] Upload complete: ${r2Key}`);
      }

      // Always dispatch queue message (insert handler is idempotent)
      console.log(`[Scryfall Parse] Sending queue message for batch ${batchNumber}`);
      await insertQueue.send({
        type: "scryfall-insert-batch",
        batchNumber,
        r2Key,
        forceReprocess,
      });
      console.log(`[Scryfall Parse] Queue message sent for batch ${batchNumber}`);

      batch = [];
    }
  }

  // Write and dispatch remaining cards in the final batch
  if (batch.length > 0) {
    batchNumber++;
    const r2Key = `${batchPrefix}/batch-${batchNumber.toString().padStart(5, "0")}.json`;

    // Check if batch file already exists in R2 (idempotency for parse stage)
    const existingBatch = forceReprocess ? null : await r2Bucket.head(r2Key);
    if (existingBatch) {
      console.log(
        `[Scryfall Parse] Final batch ${batchNumber} already exists in R2 (${(existingBatch.size / 1024).toFixed(1)}KB), skipping upload`,
      );
    } else {
      const batchJson = JSON.stringify(batch);
      console.log(
        `[Scryfall Parse] Uploading final batch ${batchNumber} to R2: ${r2Key} (${(batchJson.length / 1024).toFixed(1)}KB)`,
      );
      await r2Bucket.put(r2Key, batchJson, {
        httpMetadata: { contentType: "application/json" },
      });
      console.log(`[Scryfall Parse] Upload complete: ${r2Key}`);
    }

    // Always dispatch queue message (insert handler is idempotent)
    console.log(`[Scryfall Parse] Sending queue message for final batch ${batchNumber}`);
    await insertQueue.send({
      type: "scryfall-insert-batch",
      batchNumber,
      r2Key,
      forceReprocess,
    });
    console.log(`[Scryfall Parse] Queue message sent for final batch ${batchNumber}`);
  }

  const parseMs = Date.now() - parseStart;
  const totalMs = Date.now() - startTime;

  console.log(
    `[Scryfall Parse] Complete! Dispatched ${batchNumber} batches (${totalParsed.toLocaleString()} cards, ${totalSkipped.toLocaleString()} skipped)`,
  );
  console.log(
    `[Scryfall Parse] Timing: ${(downloadMs / 1000).toFixed(1)}s download + ${(parseMs / 1000).toFixed(1)}s parse = ${(totalMs / 1000).toFixed(1)}s total`,
  );
}

// =============================================================================
// Stage 2: Insert Batch Handler
// =============================================================================

/**
 * Handle a scryfall insert batch job from the queue (Stage 2: Insert).
 *
 * This handler is idempotent - if a chunk has already been processed,
 * it will skip processing and return early.
 *
 * This handler:
 * 1. Checks if the chunk has already been processed (idempotency check)
 * 2. Downloads the batch file from R2 using the provided key
 * 3. Parses the JSON array of cards
 * 4. Inserts cards in chunks of 100 using the json_each trick
 * 5. Marks the chunk as completed in the database
 *
 * Note: R2 batch files are preserved for historical reference.
 *
 * Multiple instances of this handler run in parallel (maxConcurrency: 5).
 */
export async function handleScryfallInsertBatch(
  message: ScryfallInsertBatchMessage,
  r2Bucket: R2Bucket,
): Promise<void> {
  const { batchNumber, r2Key, forceReprocess } = message;
  const startTime = Date.now();

  console.log(`[Scryfall Insert] Processing batch ${batchNumber} from ${r2Key}...`);

  // Check if this chunk has already been processed (idempotency check)
  if (!forceReprocess) {
    const existingChunk = await db.query.scryfallImportChunk.findFirst({
      where: eq(scryfallImportChunk.r2Key, r2Key),
    });

    if (existingChunk) {
      console.log(
        `[Scryfall Insert] Batch ${batchNumber} already processed (${existingChunk.cardsInserted} cards at ${existingChunk.completedAt.toISOString()}). Skipping.`,
      );
      return;
    }
  }

  console.log(
    `[Scryfall Insert] Batch ${batchNumber} not yet processed, proceeding with import...`,
  );

  // Download batch from R2
  const r2Object = await r2Bucket.get(r2Key);
  if (!r2Object) {
    throw new Error(`Batch file not found in R2: ${r2Key}`);
  }

  const cards: ScryfallCardInsertData[] = await r2Object.json();
  console.log(`[Scryfall Insert] Batch ${batchNumber}: loaded ${cards.length} cards from R2`);

  // Insert in chunks of 100
  const CHUNK_SIZE = 100;
  let totalInserted = 0;

  for (let i = 0; i < cards.length; i += CHUNK_SIZE) {
    const chunk = cards.slice(i, i + CHUNK_SIZE);
    const inserted = await insertChunk(chunk);
    totalInserted += inserted;
  }

  // Mark chunk as completed in the database
  const completedAt = new Date();
  if (forceReprocess) {
    await db.delete(scryfallImportChunk).where(eq(scryfallImportChunk.r2Key, r2Key));
  }
  await db.insert(scryfallImportChunk).values({
    r2Key,
    cardsInserted: totalInserted,
    startedAt: new Date(startTime),
    completedAt,
  });

  console.log(
    `[Scryfall Insert] Batch ${batchNumber} marked as completed in database (${totalInserted} cards)`,
  );

  const elapsedMs = Date.now() - startTime;
  console.log(
    `[Scryfall Insert] Batch ${batchNumber} complete: ${totalInserted} cards inserted in ${elapsedMs}ms`,
  );
}
