/**
 * Shared replication document types used by both server-side publishers
 * and client-side RxDB/TanStack DB collections.
 *
 * These types represent the wire format: Date fields are serialized as
 * epoch milliseconds (number), and every doc includes `_deleted: boolean`.
 */

// =============================================================================
// Checkpoint (shared across all entities)
// =============================================================================

export interface ReplicationCheckpoint {
  id: string;
  updatedAt: number;
}

// =============================================================================
// Deck
// =============================================================================

export interface DeckReplicationDoc {
  id: string;
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

// =============================================================================
// Deck Card
// =============================================================================

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

// =============================================================================
// Storage Container
// =============================================================================

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

// =============================================================================
// Collection Card
// =============================================================================

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

// =============================================================================
// Collection Card Location
// =============================================================================

export interface CollectionCardLocationReplicationDoc {
  id: string;
  collectionCardId: string;
  storageContainerId: string | null;
  deckId: string | null;
  assignedAt: number;
  updatedAt: number;
  _deleted: boolean;
}

// =============================================================================
// Scryfall Card
// =============================================================================

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

// =============================================================================
// Tag
// =============================================================================

export interface TagReplicationDoc {
  id: string;
  name: string;
  color: string | null;
  isSystem: boolean;
  createdAt: number;
  updatedAt: number;
  _deleted: boolean;
}
