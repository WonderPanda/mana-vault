import { replicateRxCollection } from "rxdb/plugins/replication";
import { Subject } from "rxjs";

import type { RxCollection, RxReplicationPullStreamItem } from "rxdb";
import type { RxReplicationState } from "rxdb/plugins/replication";
import type {
  DeckDoc,
  DeckCardDoc,
  ScryfallCardDoc,
  CollectionCardDoc,
  CollectionCardLocationDoc,
  StorageContainerDoc,
  TagDoc,
  ManaVaultDatabase,
} from "./db";
import type { AppRouterClient } from "@mana-vault/api/routers/index";
import { createDemultiplexedStreams } from "./multiplexed-replication";

/**
 * Checkpoint type for replication.
 * Matches the server-side ReplicationCheckpoint type.
 */
export interface ReplicationCheckpoint {
  id: string;
  updatedAt: number;
}

// =============================================================================
// Replication Factory
// =============================================================================

interface CreateReplicationOpts<DocType extends { _deleted: boolean }> {
  collection: RxCollection<DocType>;
  identifier: string;
  pullFn: (
    checkpoint: ReplicationCheckpoint | null,
    batchSize: number,
  ) => Promise<{
    documents: DocType[];
    checkpoint: ReplicationCheckpoint | null;
  }>;
  batchSize: number;
  stream$?: Subject<RxReplicationPullStreamItem<DocType, ReplicationCheckpoint>>;
  deletedField?: string;
  pushFn?: (
    changeRows: { newDocumentState: DocType; assumedMasterState: DocType | null }[],
  ) => Promise<DocType[]>;
  pushBatchSize?: number;
}

/**
 * Creates an RxDB replication state with standardized configuration.
 * Reduces the ~20 lines of boilerplate per collection to a single call.
 */
function createReplication<DocType extends { _deleted: boolean }>(
  opts: CreateReplicationOpts<DocType>,
): RxReplicationState<DocType, ReplicationCheckpoint> {
  const replicationState = replicateRxCollection<DocType, ReplicationCheckpoint>({
    collection: opts.collection,
    replicationIdentifier: opts.identifier,
    deletedField: opts.deletedField,
    pull: {
      async handler(checkpointOrNull, batchSize) {
        const checkpoint = checkpointOrNull ?? null;
        const response = await opts.pullFn(checkpoint, batchSize);
        return {
          documents: response.documents,
          checkpoint: response.checkpoint ?? undefined,
        };
      },
      batchSize: opts.batchSize,
      stream$: opts.stream$,
    },
    push: opts.pushFn
      ? {
          async handler(changeRows) {
            return opts.pushFn!(
              changeRows.map((row) => ({
                newDocumentState: row.newDocumentState,
                assumedMasterState: row.assumedMasterState ?? null,
              })),
            );
          },
          batchSize: opts.pushBatchSize ?? 10,
        }
      : undefined,
    autoStart: true,
    live: true,
    retryTime: 5000,
  });

  replicationState.error$.subscribe((error) => {
    console.error(`${opts.identifier} error:`, error);
  });

  return replicationState;
}

// =============================================================================
// Multiplexed Stream Setup
// =============================================================================

/**
 * Return type for setupReplicationsWithMultiplexedStream.
 * Contains all replication states for monitoring and control.
 */
export interface MultiplexedReplicationStates {
  deckReplicationState: RxReplicationState<DeckDoc, ReplicationCheckpoint>;
  deckCardReplicationState: RxReplicationState<DeckCardDoc, ReplicationCheckpoint>;
  storageContainerReplicationState: RxReplicationState<StorageContainerDoc, ReplicationCheckpoint>;
  collectionCardReplicationState: RxReplicationState<CollectionCardDoc, ReplicationCheckpoint>;
  collectionCardLocationReplicationState: RxReplicationState<
    CollectionCardLocationDoc,
    ReplicationCheckpoint
  >;
  scryfallCardReplicationState: RxReplicationState<ScryfallCardDoc, ReplicationCheckpoint>;
  tagReplicationState: RxReplicationState<TagDoc, ReplicationCheckpoint>;
}

/**
 * Sets up live replication for all collections using a single multiplexed SSE stream.
 *
 * This reduces browser connection usage from 5 SSE streams to just 1,
 * staying well within the browser's ~6 connection per origin limit.
 *
 * @param db - The RxDB database instance
 * @param client - The oRPC client instance
 * @returns Object containing all replication states for monitoring/control
 */
export function setupReplicationsWithMultiplexedStream(
  db: ManaVaultDatabase,
  client: AppRouterClient,
): MultiplexedReplicationStates {
  const streams = createDemultiplexedStreams(client);

  const deckReplicationState = createReplication<DeckDoc>({
    collection: db.decks,
    identifier: "deck-replication",
    deletedField: "_deleted",
    pullFn: (checkpoint, batchSize) => client.decks.sync.pull({ checkpoint, batchSize }),
    batchSize: 50,
    stream$: streams.deck$,
    pushFn: async (rows) => {
      const response = await client.decks.sync.push({ rows });
      return response.conflicts;
    },
    pushBatchSize: 10,
  });

  const deckCardReplicationState = createReplication<DeckCardDoc>({
    collection: db.deck_cards,
    identifier: "deck-card-pull-replication",
    pullFn: (checkpoint, batchSize) => client.decks.cardSync.pull({ checkpoint, batchSize }),
    batchSize: 100,
    stream$: streams.deckCard$,
  });

  const storageContainerReplicationState = createReplication<StorageContainerDoc>({
    collection: db.storage_containers,
    identifier: "storage-container-pull-replication",
    pullFn: (checkpoint, batchSize) => client.collections.sync.pull({ checkpoint, batchSize }),
    batchSize: 50,
    deletedField: "_deleted",
    stream$: streams.storageContainer$,
  });

  const collectionCardReplicationState = createReplication<CollectionCardDoc>({
    collection: db.collection_cards,
    identifier: "collection-card-pull-replication",
    pullFn: (checkpoint, batchSize) => client.collections.cardSync.pull({ checkpoint, batchSize }),
    batchSize: 100,
    deletedField: "_deleted",
    stream$: streams.collectionCard$,
  });

  const collectionCardLocationReplicationState = createReplication<CollectionCardLocationDoc>({
    collection: db.collection_card_locations,
    identifier: "collection-card-location-pull-replication",
    pullFn: (checkpoint, batchSize) =>
      client.collections.locationSync.pull({ checkpoint, batchSize }),
    batchSize: 100,
    deletedField: "_deleted",
    stream$: streams.collectionCardLocation$,
  });

  const tagReplicationState = createReplication<TagDoc>({
    collection: db.tags,
    identifier: "tag-replication",
    deletedField: "_deleted",
    pullFn: (checkpoint, batchSize) => client.tags.sync.pull({ checkpoint, batchSize }),
    batchSize: 50,
    stream$: streams.tag$,
    pushFn: async (rows) => {
      const response = await client.tags.sync.push({ rows });
      return response.conflicts;
    },
    pushBatchSize: 10,
  });

  // Scryfall cards: pull-only, no live stream.
  // The server computes an effective_updated_at (MAX of the scryfall card's own timestamp
  // and the referencing deck_card/collection_card/virtual_list_card timestamps), so newly
  // linked cards appear past the checkpoint even though the card data itself is old.
  // We just need to trigger reSync() when deck/collection cards change.
  const scryfallCardReplicationState = createReplication<ScryfallCardDoc>({
    collection: db.scryfall_cards,
    identifier: "scryfall-card-pull-replication",
    pullFn: (checkpoint, batchSize) => client.cards.sync.pull({ checkpoint, batchSize }),
    batchSize: 100,
  });

  const triggerScryfallReSync = () => scryfallCardReplicationState.reSync();
  streams.deckCard$.subscribe(triggerScryfallReSync);
  streams.collectionCard$.subscribe(triggerScryfallReSync);

  return {
    deckReplicationState,
    deckCardReplicationState,
    storageContainerReplicationState,
    collectionCardReplicationState,
    collectionCardLocationReplicationState,
    scryfallCardReplicationState,
    tagReplicationState,
  };
}
