import { Subject } from "rxjs";

import type { RxReplicationPullStreamItem } from "rxdb";
import type {
  DeckDoc,
  DeckCardDoc,
  StorageContainerDoc,
  CollectionCardDoc,
  CollectionCardLocationDoc,
  TagDoc,
} from "./db";
import type { ReplicationCheckpoint } from "./replication";
import type { AppRouterClient } from "@mana-vault/api/routers/index";

/**
 * Interface for the demultiplexed streams.
 * Each stream corresponds to an RxDB collection and emits events
 * in the format expected by RxDB's pull.stream$.
 */
export interface DemultiplexedStreams {
  deck$: Subject<RxReplicationPullStreamItem<DeckDoc, ReplicationCheckpoint>>;
  deckCard$: Subject<RxReplicationPullStreamItem<DeckCardDoc, ReplicationCheckpoint>>;
  storageContainer$: Subject<
    RxReplicationPullStreamItem<StorageContainerDoc, ReplicationCheckpoint>
  >;
  collectionCard$: Subject<RxReplicationPullStreamItem<CollectionCardDoc, ReplicationCheckpoint>>;
  collectionCardLocation$: Subject<
    RxReplicationPullStreamItem<CollectionCardLocationDoc, ReplicationCheckpoint>
  >;
  tag$: Subject<RxReplicationPullStreamItem<TagDoc, ReplicationCheckpoint>>;
}

/**
 * Creates demultiplexed streams from the single multiplexed SSE endpoint.
 *
 * This function:
 * 1. Connects to the multiplexed sync.stream endpoint
 * 2. Routes incoming events to the appropriate Subject based on entity type
 * 3. Handles connection errors by emitting RESYNC to all streams
 *
 * The returned streams can be passed to RxDB's replicateRxCollection as pull.stream$.
 *
 * @param client - The oRPC client instance
 * @returns Object containing Subject streams for each entity type
 */
export function createDemultiplexedStreams(client: AppRouterClient): DemultiplexedStreams {
  const streams: DemultiplexedStreams = {
    deck$: new Subject(),
    deckCard$: new Subject(),
    storageContainer$: new Subject(),
    collectionCard$: new Subject(),
    collectionCardLocation$: new Subject(),
    tag$: new Subject(),
  };

  // Helper to emit RESYNC to all streams
  const emitResyncToAll = () => {
    streams.deck$.next("RESYNC");
    streams.deckCard$.next("RESYNC");
    streams.storageContainer$.next("RESYNC");
    streams.collectionCard$.next("RESYNC");
    streams.collectionCardLocation$.next("RESYNC");
    streams.tag$.next("RESYNC");
  };

  // Start consuming the multiplexed stream in the background
  (async () => {
    try {
      const iterator = await client.sync.stream({});

      for await (const multiplexedEvent of iterator) {
        const { type, event } = multiplexedEvent;

        // Handle RESYNC signal (used after bulk imports)
        if (event === "RESYNC") {
          console.log(`[Multiplexed Stream] Received RESYNC for ${type}`);
          switch (type) {
            case "deck":
              streams.deck$.next("RESYNC");
              break;
            case "deckCard":
              streams.deckCard$.next("RESYNC");
              break;
            case "storageContainer":
              streams.storageContainer$.next("RESYNC");
              break;
            case "collectionCard":
              streams.collectionCard$.next("RESYNC");
              break;
            case "collectionCardLocation":
              streams.collectionCardLocation$.next("RESYNC");
              break;
            case "tag":
              streams.tag$.next("RESYNC");
              break;
          }
          continue;
        }

        // For document events, only emit if checkpoint is non-null
        // (RxDB expects checkpoint in stream events)
        if (event.checkpoint !== null) {
          // Debug: log deletions
          const deletedDocs = event.documents.filter((d: { _deleted: boolean }) => d._deleted);
          if (deletedDocs.length > 0) {
            console.log(`[Multiplexed Stream] Received deleted ${type} documents:`, deletedDocs);
          }

          // Route to appropriate stream based on type
          // Each case has proper type narrowing from the discriminated union
          switch (type) {
            case "deck":
              streams.deck$.next({
                documents: event.documents,
                checkpoint: event.checkpoint,
              });
              break;
            case "deckCard":
              streams.deckCard$.next({
                documents: event.documents,
                checkpoint: event.checkpoint,
              });
              break;
            case "storageContainer":
              streams.storageContainer$.next({
                documents: event.documents,
                checkpoint: event.checkpoint,
              });
              break;
            case "collectionCard":
              streams.collectionCard$.next({
                documents: event.documents,
                checkpoint: event.checkpoint,
              });
              break;
            case "collectionCardLocation":
              streams.collectionCardLocation$.next({
                documents: event.documents,
                checkpoint: event.checkpoint,
              });
              break;
            case "tag":
              streams.tag$.next({
                documents: event.documents,
                checkpoint: event.checkpoint,
              });
              break;
          }
        }
      }
    } catch (error) {
      console.error(
        "[Multiplexed Stream] Connection error, triggering RESYNC on all streams:",
        error,
      );
      emitResyncToAll();
    }
  })();

  return streams;
}
