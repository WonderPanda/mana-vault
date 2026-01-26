import { EventPublisher } from "@orpc/server";

// =============================================================================
// Deck Replication Types
// =============================================================================

/**
 * RxDB replication document format for decks.
 * Contains the document data plus metadata for replication.
 */
export interface DeckReplicationDoc {
  id: string;
  userId: string;
  name: string;
  format: string;
  status: string;
  archetype: string | null;
  colorIdentity: string | null;
  description: string | null;
  isPublic: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  _deleted: boolean;
}

/**
 * Checkpoint for RxDB replication.
 * Uses updatedAt + id for stable ordering.
 */
export interface DeckReplicationCheckpoint {
  id: string;
  updatedAt: number;
}

/**
 * Event payload for deck stream events.
 * Matches RxDB's RxReplicationPullStreamItem format.
 */
export interface DeckStreamEvent {
  documents: DeckReplicationDoc[];
  checkpoint: DeckReplicationCheckpoint | null;
}

/**
 * Publisher for deck replication events.
 *
 * This uses oRPC's lightweight EventPublisher for synchronous publishing.
 * Events are keyed by userId so each user only receives their own updates.
 *
 * Usage:
 * - Subscribe: `deckPublisher.subscribe(userId, { signal })`
 * - Publish: `deckPublisher.publish(userId, event)`
 */
export const deckPublisher = new EventPublisher<Record<string, DeckStreamEvent>>();

/**
 * Helper to create a replication document from a database deck row.
 */
export function toDeckReplicationDoc(
  doc: {
    id: string;
    userId: string;
    name: string;
    format: string;
    status: string;
    archetype: string | null;
    colorIdentity: string | null;
    description: string | null;
    isPublic: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  },
  deleted = false,
): DeckReplicationDoc {
  return {
    id: doc.id,
    userId: doc.userId,
    name: doc.name,
    format: doc.format,
    status: doc.status,
    archetype: doc.archetype,
    colorIdentity: doc.colorIdentity,
    description: doc.description,
    isPublic: doc.isPublic,
    sortOrder: doc.sortOrder,
    createdAt: doc.createdAt.getTime(),
    updatedAt: doc.updatedAt.getTime(),
    _deleted: deleted,
  };
}

// =============================================================================
// Deck Card Replication Types
// =============================================================================

/**
 * RxDB replication document format for deck cards.
 */
export interface DeckCardReplicationDoc {
  id: string;
  deckId: string;
  oracleId: string;
  preferredScryfallId: string | null;
  quantity: number;
  board: string;
  isCommander: boolean;
  isCompanion: boolean;
  collectionCardId: string | null;
  isProxy: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  _deleted: boolean;
}

/**
 * Event payload for deck card stream events.
 * Can be either documents with checkpoint, or 'RESYNC' to trigger full re-sync.
 */
export type DeckCardStreamEvent =
  | {
      documents: DeckCardReplicationDoc[];
      checkpoint: DeckReplicationCheckpoint | null;
    }
  | "RESYNC";

/**
 * Publisher for deck card replication events.
 *
 * Events are keyed by `userId` so each user only receives their own updates.
 * For bulk operations (like imports), emit 'RESYNC' instead of individual cards.
 */
export const deckCardPublisher = new EventPublisher<Record<string, DeckCardStreamEvent>>();

/**
 * Helper to create a replication document from a database deck card row.
 */
export function toDeckCardReplicationDoc(
  doc: {
    id: string;
    deckId: string;
    oracleId: string;
    preferredScryfallId: string | null;
    quantity: number;
    board: string;
    isCommander: boolean;
    isCompanion: boolean;
    collectionCardId: string | null;
    isProxy: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  },
  deleted = false,
): DeckCardReplicationDoc {
  return {
    id: doc.id,
    deckId: doc.deckId,
    oracleId: doc.oracleId,
    preferredScryfallId: doc.preferredScryfallId,
    quantity: doc.quantity,
    board: doc.board,
    isCommander: doc.isCommander,
    isCompanion: doc.isCompanion,
    collectionCardId: doc.collectionCardId,
    isProxy: doc.isProxy,
    sortOrder: doc.sortOrder,
    createdAt: doc.createdAt.getTime(),
    updatedAt: doc.updatedAt.getTime(),
    _deleted: deleted,
  };
}
