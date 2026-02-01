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

// Maps entity type strings from the multiplexed stream to DemultiplexedStreams keys
const entityTypeToStreamKey: Record<string, keyof DemultiplexedStreams> = {
  deck: "deck$",
  deckCard: "deckCard$",
  storageContainer: "storageContainer$",
  collectionCard: "collectionCard$",
  collectionCardLocation: "collectionCardLocation$",
  tag: "tag$",
};

/**
 * Creates demultiplexed streams from the single multiplexed SSE endpoint.
 *
 * This function:
 * 1. Connects to the multiplexed sync.stream endpoint
 * 2. Routes incoming events to the appropriate Subject based on entity type
 * 3. Handles connection errors by emitting RESYNC to all streams
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

  const allStreams = Object.values(streams);

  // Start consuming the multiplexed stream in the background
  (async () => {
    try {
      const iterator = await client.sync.stream({});

      for await (const multiplexedEvent of iterator) {
        const { type, event } = multiplexedEvent;
        const streamKey = entityTypeToStreamKey[type];
        if (!streamKey) continue;

        const stream = streams[streamKey] as Subject<any>;

        if (event === "RESYNC") {
          console.log(`[Multiplexed Stream] Received RESYNC for ${type}`);
          stream.next("RESYNC");
          continue;
        }

        // Only emit if checkpoint is non-null (RxDB expects checkpoint in stream events)
        if (event.checkpoint !== null) {
          const deletedDocs = event.documents.filter((d: { _deleted: boolean }) => d._deleted);
          if (deletedDocs.length > 0) {
            console.log(`[Multiplexed Stream] Received deleted ${type} documents:`, deletedDocs);
          }

          stream.next({
            documents: event.documents,
            checkpoint: event.checkpoint,
          });
        }
      }
    } catch (error) {
      console.error(
        "[Multiplexed Stream] Connection error, triggering RESYNC on all streams:",
        error,
      );
      for (const stream of allStreams) {
        stream.next("RESYNC");
      }
    }
  })();

  return streams;
}
