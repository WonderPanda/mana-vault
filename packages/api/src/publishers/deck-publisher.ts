import { EventPublisher } from "@orpc/server";

import type {
  DeckReplicationDoc,
  DeckCardReplicationDoc,
  ReplicationCheckpoint,
} from "./replication-types";
import { toReplicationDoc } from "./to-replication-doc";

// Re-export types for consumers
export type { DeckReplicationDoc, DeckCardReplicationDoc } from "./replication-types";

// =============================================================================
// Deck Replication
// =============================================================================

export interface DeckStreamEvent {
  documents: DeckReplicationDoc[];
  checkpoint: ReplicationCheckpoint | null;
}

export const deckPublisher = new EventPublisher<Record<string, DeckStreamEvent>>();

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
  return toReplicationDoc(doc, ["createdAt", "updatedAt"], deleted) as DeckReplicationDoc;
}

// =============================================================================
// Deck Card Replication
// =============================================================================

export type DeckCardStreamEvent =
  | {
      documents: DeckCardReplicationDoc[];
      checkpoint: ReplicationCheckpoint | null;
    }
  | "RESYNC";

export const deckCardPublisher = new EventPublisher<Record<string, DeckCardStreamEvent>>();

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
  return toReplicationDoc(doc, ["createdAt", "updatedAt"], deleted) as DeckCardReplicationDoc;
}
