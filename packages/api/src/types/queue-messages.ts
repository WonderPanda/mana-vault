/**
 * Message types for Cloudflare Queues
 */

/**
 * Message to trigger a Scryfall bulk data import (Stage 1: Parse & Dispatch)
 * Downloads/reads bulk data, parses it, writes batches to R2, and dispatches
 * insert jobs with R2 keys
 */
export type ScryfallImportMessage = {
  type: "scryfall-import";
  bulkDataType: "oracle_cards" | "unique_artwork" | "default_cards" | "all_cards";
  englishOnly: boolean;
  downloadUri: string;
  forceReprocess: boolean;
};

/**
 * Card data prepared for database insertion
 */
export type ScryfallCardInsertData = {
  id: string;
  oracle_id: string;
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  oracle_text: string | null;
  colors: string | null;
  color_identity: string | null;
  image_uri: string | null;
  scryfall_uri: string | null;
  price_usd: number | null;
  price_usd_foil: number | null;
  price_usd_etched: number | null;
  data_json: string;
};

/**
 * Message to insert a batch of cards (Stage 2: Insert)
 * Contains only the R2 key where the batch data is stored
 */
export type ScryfallInsertBatchMessage = {
  type: "scryfall-insert-batch";
  batchNumber: number;
  r2Key: string;
  forceReprocess: boolean;
};
