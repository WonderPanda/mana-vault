import { EventPublisher } from "@orpc/server";

// =============================================================================
// Storage Container (Collection) Replication Types
// =============================================================================

/**
 * RxDB replication document format for storage containers (collections).
 * Contains the document data plus metadata for replication.
 */
export interface StorageContainerReplicationDoc {
  id: string;
  userId: string;
  name: string;
  type: string;
  description: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  _deleted: boolean;
}

/**
 * Checkpoint for RxDB replication.
 * Uses updatedAt + id for stable ordering.
 */
export interface StorageContainerReplicationCheckpoint {
  id: string;
  updatedAt: number;
}

/**
 * Event payload for storage container stream events.
 * Matches RxDB's RxReplicationPullStreamItem format.
 */
export interface StorageContainerStreamEvent {
  documents: StorageContainerReplicationDoc[];
  checkpoint: StorageContainerReplicationCheckpoint | null;
}

/**
 * Publisher for storage container replication events.
 *
 * This uses oRPC's lightweight EventPublisher for synchronous publishing.
 * Events are keyed by userId so each user only receives their own updates.
 *
 * Usage:
 * - Subscribe: `storageContainerPublisher.subscribe(userId, { signal })`
 * - Publish: `storageContainerPublisher.publish(userId, event)`
 */
export const storageContainerPublisher = new EventPublisher<
  Record<string, StorageContainerStreamEvent>
>();

/**
 * Helper to create a replication document from a database storage container row.
 */
export function toStorageContainerReplicationDoc(
  doc: {
    id: string;
    userId: string;
    name: string;
    type: string;
    description: string | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  },
  deleted = false,
): StorageContainerReplicationDoc {
  return {
    id: doc.id,
    userId: doc.userId,
    name: doc.name,
    type: doc.type,
    description: doc.description,
    sortOrder: doc.sortOrder,
    createdAt: doc.createdAt.getTime(),
    updatedAt: doc.updatedAt.getTime(),
    _deleted: deleted,
  };
}

// =============================================================================
// Collection Card Replication Types
// =============================================================================

/**
 * RxDB replication document format for collection cards.
 * Contains the document data plus metadata for replication.
 */
export interface CollectionCardReplicationDoc {
  id: string;
  userId: string;
  scryfallCardId: string;
  condition: string;
  isFoil: boolean;
  language: string;
  notes: string | null;
  acquiredAt: number | null;
  acquiredFrom: string | null;
  status: string;
  removedAt: number | null;
  createdAt: number;
  updatedAt: number;
  _deleted: boolean;
}

/**
 * Checkpoint for RxDB replication.
 * Uses updatedAt + id for stable ordering.
 */
export interface CollectionCardReplicationCheckpoint {
  id: string;
  updatedAt: number;
}

/**
 * Event payload for collection card stream events.
 * Can be either documents with checkpoint, or 'RESYNC' to trigger full re-sync.
 */
export type CollectionCardStreamEvent =
  | {
      documents: CollectionCardReplicationDoc[];
      checkpoint: CollectionCardReplicationCheckpoint | null;
    }
  | "RESYNC";

/**
 * Publisher for collection card replication events.
 *
 * This uses oRPC's lightweight EventPublisher for synchronous publishing.
 * Events are keyed by userId so each user only receives their own updates.
 *
 * Usage:
 * - Subscribe: `collectionCardPublisher.subscribe(userId, { signal })`
 * - Publish: `collectionCardPublisher.publish(userId, event)`
 */
export const collectionCardPublisher = new EventPublisher<
  Record<string, CollectionCardStreamEvent>
>();

/**
 * Helper to create a replication document from a database collection card row.
 */
export function toCollectionCardReplicationDoc(
  doc: {
    id: string;
    userId: string;
    scryfallCardId: string;
    condition: string;
    isFoil: boolean;
    language: string;
    notes: string | null;
    acquiredAt: Date | null;
    acquiredFrom: string | null;
    status: string;
    removedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  deleted = false,
): CollectionCardReplicationDoc {
  return {
    id: doc.id,
    userId: doc.userId,
    scryfallCardId: doc.scryfallCardId,
    condition: doc.condition,
    isFoil: doc.isFoil,
    language: doc.language,
    notes: doc.notes,
    acquiredAt: doc.acquiredAt?.getTime() ?? null,
    acquiredFrom: doc.acquiredFrom,
    status: doc.status,
    removedAt: doc.removedAt?.getTime() ?? null,
    createdAt: doc.createdAt.getTime(),
    updatedAt: doc.updatedAt.getTime(),
    _deleted: deleted,
  };
}

// =============================================================================
// Collection Card Location Replication Types
// =============================================================================

/**
 * RxDB replication document format for collection card locations.
 * Links collection cards to storage containers or decks.
 */
export interface CollectionCardLocationReplicationDoc {
  id: string;
  collectionCardId: string;
  storageContainerId: string | null;
  deckId: string | null;
  assignedAt: number;
  _deleted: boolean;
}

/**
 * Event payload for collection card location stream events.
 * Can be either documents with checkpoint, or 'RESYNC' to trigger full re-sync.
 */
export type CollectionCardLocationStreamEvent =
  | {
      documents: CollectionCardLocationReplicationDoc[];
      checkpoint: CollectionCardReplicationCheckpoint | null;
    }
  | "RESYNC";

/**
 * Publisher for collection card location replication events.
 *
 * Events are keyed by userId so each user only receives their own updates.
 */
export const collectionCardLocationPublisher = new EventPublisher<
  Record<string, CollectionCardLocationStreamEvent>
>();

/**
 * Helper to create a replication document from a database collection card location row.
 */
export function toCollectionCardLocationReplicationDoc(
  doc: {
    id: string;
    collectionCardId: string;
    storageContainerId: string | null;
    deckId: string | null;
    assignedAt: Date;
  },
  deleted = false,
): CollectionCardLocationReplicationDoc {
  return {
    id: doc.id,
    collectionCardId: doc.collectionCardId,
    storageContainerId: doc.storageContainerId,
    deckId: doc.deckId,
    assignedAt: doc.assignedAt.getTime(),
    _deleted: deleted,
  };
}
