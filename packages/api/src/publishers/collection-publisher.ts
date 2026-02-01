import { EventPublisher } from "@orpc/server";

import type {
  StorageContainerReplicationDoc,
  CollectionCardReplicationDoc,
  CollectionCardLocationReplicationDoc,
  ReplicationCheckpoint,
} from "./replication-types";
import { toReplicationDoc } from "./to-replication-doc";

// Re-export types for consumers
export type {
  StorageContainerReplicationDoc,
  CollectionCardReplicationDoc,
  CollectionCardLocationReplicationDoc,
} from "./replication-types";

// =============================================================================
// Storage Container Replication
// =============================================================================

export interface StorageContainerStreamEvent {
  documents: StorageContainerReplicationDoc[];
  checkpoint: ReplicationCheckpoint | null;
}

export const storageContainerPublisher = new EventPublisher<
  Record<string, StorageContainerStreamEvent>
>();

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
  return toReplicationDoc(
    doc,
    ["createdAt", "updatedAt"],
    deleted,
  ) as StorageContainerReplicationDoc;
}

// =============================================================================
// Collection Card Replication
// =============================================================================

export type CollectionCardStreamEvent =
  | {
      documents: CollectionCardReplicationDoc[];
      checkpoint: ReplicationCheckpoint | null;
    }
  | "RESYNC";

export const collectionCardPublisher = new EventPublisher<
  Record<string, CollectionCardStreamEvent>
>();

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
  return toReplicationDoc(
    doc,
    ["acquiredAt", "removedAt", "createdAt", "updatedAt"],
    deleted,
  ) as CollectionCardReplicationDoc;
}

// =============================================================================
// Collection Card Location Replication
// =============================================================================

export type CollectionCardLocationStreamEvent =
  | {
      documents: CollectionCardLocationReplicationDoc[];
      checkpoint: ReplicationCheckpoint | null;
    }
  | "RESYNC";

export const collectionCardLocationPublisher = new EventPublisher<
  Record<string, CollectionCardLocationStreamEvent>
>();

export function toCollectionCardLocationReplicationDoc(
  doc: {
    id: string;
    collectionCardId: string;
    storageContainerId: string | null;
    deckId: string | null;
    assignedAt: Date;
    updatedAt: Date | null;
  },
  deleted = false,
): CollectionCardLocationReplicationDoc {
  return {
    id: doc.id,
    collectionCardId: doc.collectionCardId,
    storageContainerId: doc.storageContainerId,
    deckId: doc.deckId,
    assignedAt: doc.assignedAt.getTime(),
    updatedAt: doc.updatedAt?.getTime() ?? doc.assignedAt.getTime(),
    _deleted: deleted,
  };
}
