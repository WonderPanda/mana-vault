import { EventPublisher } from "@orpc/server";

// =============================================================================
// Scryfall Card Replication Types
// =============================================================================

/**
 * RxDB replication document format for scryfall cards.
 */
export interface ScryfallCardReplicationDoc {
  id: string;
  oracleId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  manaCost: string | null;
  cmc: number;
  typeLine: string | null;
  oracleText: string | null;
  colors: string | null;
  colorIdentity: string | null;
  imageUri: string | null;
  scryfallUri: string | null;
  priceUsd: number | null;
  priceUsdFoil: number | null;
  priceUsdEtched: number | null;
  dataJson: string | null;
  createdAt: number;
  updatedAt: number;
  _deleted: boolean;
}

/**
 * Checkpoint for RxDB replication.
 * Uses updatedAt + id for stable ordering.
 */
export interface ScryfallCardReplicationCheckpoint {
  id: string;
  updatedAt: number;
}

/**
 * Event payload for scryfall card stream events.
 * Can be either documents with checkpoint, or 'RESYNC' to trigger full re-sync.
 *
 * We use 'RESYNC' for bulk operations (like when cards are added to a deck)
 * because emitting individual documents would be inefficient.
 */
export type ScryfallCardStreamEvent =
  | {
      documents: ScryfallCardReplicationDoc[];
      checkpoint: ScryfallCardReplicationCheckpoint | null;
    }
  | "RESYNC";

/**
 * Publisher for scryfall card replication events.
 *
 * Events are keyed by `userId` so each user only receives updates for cards
 * they reference (in their collection, decks, or lists).
 *
 * For bulk operations (like adding cards to a deck), emit 'RESYNC' instead
 * of individual cards to trigger a full re-sync from the checkpoint.
 */
export const scryfallCardPublisher = new EventPublisher<Record<string, ScryfallCardStreamEvent>>();

/**
 * Helper to create a replication document from a database scryfall card row.
 */
export function toScryfallCardReplicationDoc(
  doc: {
    id: string;
    oracleId: string;
    name: string;
    setCode: string;
    setName: string;
    collectorNumber: string;
    rarity: string;
    manaCost: string | null;
    cmc: number;
    typeLine: string | null;
    oracleText: string | null;
    colors: string | null;
    colorIdentity: string | null;
    imageUri: string | null;
    scryfallUri: string | null;
    priceUsd: number | null;
    priceUsdFoil: number | null;
    priceUsdEtched: number | null;
    dataJson: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  deleted = false,
): ScryfallCardReplicationDoc {
  return {
    id: doc.id,
    oracleId: doc.oracleId,
    name: doc.name,
    setCode: doc.setCode,
    setName: doc.setName,
    collectorNumber: doc.collectorNumber,
    rarity: doc.rarity,
    manaCost: doc.manaCost,
    cmc: doc.cmc,
    typeLine: doc.typeLine,
    oracleText: doc.oracleText,
    colors: doc.colors,
    colorIdentity: doc.colorIdentity,
    imageUri: doc.imageUri,
    scryfallUri: doc.scryfallUri,
    priceUsd: doc.priceUsd,
    priceUsdFoil: doc.priceUsdFoil,
    priceUsdEtched: doc.priceUsdEtched,
    dataJson: doc.dataJson,
    createdAt: doc.createdAt.getTime(),
    updatedAt: doc.updatedAt.getTime(),
    _deleted: deleted,
  };
}
