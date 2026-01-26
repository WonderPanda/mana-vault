import { replicateRxCollection } from "rxdb/plugins/replication";
import { Subject } from "rxjs";

import type { RxReplicationState } from "rxdb/plugins/replication";
import type { RxReplicationPullStreamItem } from "rxdb";
import type { DeckDoc, DeckCardDoc, ScryfallCardDoc, ManaVaultDatabase } from "./db";
import type { AppRouterClient } from "@mana-vault/api/routers/index";

/**
 * Checkpoint type for replication.
 * Matches the server-side ReplicationCheckpoint type.
 */
export interface ReplicationCheckpoint {
  id: string;
  updatedAt: number;
}

/**
 * Creates an RxJS Subject that subscribes to an oRPC event iterator (SSE stream)
 * and emits events in the format expected by RxDB's pull.stream$.
 *
 * When the connection is lost, it emits 'RESYNC' to trigger checkpoint iteration.
 *
 * @param streamFn - Async function that returns the async iterator from oRPC
 * @returns Subject that emits RxReplicationPullStreamItem events
 */
function createPullStream<RxDocType extends { _deleted: boolean }, CheckpointType>(
  streamFn: () => Promise<
    AsyncIterable<{
      documents: RxDocType[];
      checkpoint: CheckpointType | null;
    }>
  >,
): Subject<RxReplicationPullStreamItem<RxDocType, CheckpointType>> {
  const subject = new Subject<RxReplicationPullStreamItem<RxDocType, CheckpointType>>();

  // Start consuming the stream
  (async () => {
    try {
      // oRPC returns a promise that resolves to the async iterator
      const iterator = await streamFn();
      for await (const event of iterator) {
        // RxDB expects checkpoint to be non-null in stream events
        // If null, we skip emitting (shouldn't happen in practice)
        if (event.checkpoint !== null) {
          subject.next({
            documents: event.documents,
            checkpoint: event.checkpoint,
          });
        }
      }
    } catch (error) {
      console.error("Pull stream error, triggering RESYNC:", error);
      // Emit RESYNC to tell RxDB to switch back to checkpoint iteration
      subject.next("RESYNC");
    }
  })();

  return subject;
}

/**
 * Creates an RxJS Subject for streams that can emit either documents or 'RESYNC'.
 * This is used for bulk operations where emitting individual documents is inefficient.
 *
 * @param streamFn - Async function that returns the async iterator from oRPC
 * @returns Subject that emits RxReplicationPullStreamItem events
 */
function createPullStreamWithResync<RxDocType extends { _deleted: boolean }, CheckpointType>(
  streamFn: () => Promise<
    AsyncIterable<
      | {
          documents: RxDocType[];
          checkpoint: CheckpointType | null;
        }
      | "RESYNC"
    >
  >,
): Subject<RxReplicationPullStreamItem<RxDocType, CheckpointType>> {
  const subject = new Subject<RxReplicationPullStreamItem<RxDocType, CheckpointType>>();

  // Start consuming the stream
  (async () => {
    try {
      // oRPC returns a promise that resolves to the async iterator
      const iterator = await streamFn();
      for await (const event of iterator) {
        // Handle RESYNC signal from server (used after bulk imports)
        if (event === "RESYNC") {
          subject.next("RESYNC");
          continue;
        }

        // RxDB expects checkpoint to be non-null in stream events
        if (event.checkpoint !== null) {
          subject.next({
            documents: event.documents,
            checkpoint: event.checkpoint,
          });
        }
      }
    } catch (error) {
      console.error("Pull stream error, triggering RESYNC:", error);
      // Emit RESYNC to tell RxDB to switch back to checkpoint iteration
      subject.next("RESYNC");
    }
  })();

  return subject;
}

/**
 * Sets up live replication for the decks collection with pullStream$.
 * Uses oRPC to fetch documents from the server and SSE for real-time updates.
 *
 * @param db - The RxDB database instance
 * @param client - The oRPC client instance
 * @returns The replication state for monitoring/control
 */
export function setupDeckReplication(
  db: ManaVaultDatabase,
  client: AppRouterClient,
): RxReplicationState<DeckDoc, ReplicationCheckpoint> {
  // Create the pull stream that connects to the SSE endpoint
  const pullStream$ = createPullStream<DeckDoc, ReplicationCheckpoint>(() =>
    client.sync.decks.stream({}),
  );

  const replicationState = replicateRxCollection<DeckDoc, ReplicationCheckpoint>({
    collection: db.decks,
    replicationIdentifier: "deck-pull-replication",
    pull: {
      async handler(checkpointOrNull, batchSize) {
        // Convert undefined to null for oRPC (RxDB uses undefined, oRPC uses null)
        const checkpoint = checkpointOrNull ?? null;

        const response = await client.sync.decks.pull({
          checkpoint,
          batchSize,
        });

        return {
          documents: response.documents,
          // Convert null back to undefined for RxDB
          checkpoint: response.checkpoint ?? undefined,
        };
      },
      batchSize: 50,
      // Connect the SSE stream for live updates
      stream$: pullStream$,
    },
    autoStart: true,
    // No push handler - pull-only replication
    push: undefined,
    // Enable live streaming mode
    live: true,
    // Retry on error
    retryTime: 5000,
  });

  // Log replication events for debugging
  replicationState.error$.subscribe((error) => {
    console.error("Deck replication error:", error);
  });

  replicationState.active$.subscribe((active) => {
    console.log("Deck replication active:", active);
  });

  return replicationState;
}

/**
 * Sets up live replication for the deck_cards collection with pullStream$.
 * Syncs all deck cards for decks owned by the user.
 *
 * The stream supports 'RESYNC' signals for efficient bulk import handling.
 *
 * @param db - The RxDB database instance
 * @param client - The oRPC client instance
 * @returns The replication state for monitoring/control
 */
export function setupDeckCardReplication(
  db: ManaVaultDatabase,
  client: AppRouterClient,
): RxReplicationState<DeckCardDoc, ReplicationCheckpoint> {
  // Create the pull stream that connects to the SSE endpoint
  // This stream can emit documents or 'RESYNC' (for bulk imports)
  const pullStream$ = createPullStreamWithResync<DeckCardDoc, ReplicationCheckpoint>(() =>
    client.sync.deckCards.stream({}),
  );

  const replicationState = replicateRxCollection<DeckCardDoc, ReplicationCheckpoint>({
    collection: db.deck_cards,
    replicationIdentifier: "deck-card-pull-replication",
    pull: {
      async handler(checkpointOrNull, batchSize) {
        // Convert undefined to null for oRPC (RxDB uses undefined, oRPC uses null)
        const checkpoint = checkpointOrNull ?? null;

        const response = await client.sync.deckCards.pull({
          checkpoint,
          batchSize,
        });

        return {
          documents: response.documents,
          // Convert null back to undefined for RxDB
          checkpoint: response.checkpoint ?? undefined,
        };
      },
      batchSize: 100,
      // Connect the SSE stream for live updates
      stream$: pullStream$,
    },
    autoStart: true,
    // No push handler - pull-only replication
    push: undefined,
    // Enable live streaming mode
    live: true,
    // Retry on error
    retryTime: 5000,
  });

  // Log replication events for debugging
  replicationState.error$.subscribe((error) => {
    console.error("Deck card replication error:", error);
  });

  replicationState.active$.subscribe((active) => {
    console.log("Deck card replication active:", active);
  });

  return replicationState;
}

/**
 * Sets up pull-only replication for the scryfall_cards collection.
 * Only syncs cards that are referenced by the user's collection, decks, or lists.
 *
 * @param db - The RxDB database instance
 * @param client - The oRPC client instance
 * @returns The replication state for monitoring/control
 */
export function setupScryfallCardReplication(
  db: ManaVaultDatabase,
  client: AppRouterClient,
): RxReplicationState<ScryfallCardDoc, ReplicationCheckpoint> {
  const replicationState = replicateRxCollection<ScryfallCardDoc, ReplicationCheckpoint>({
    collection: db.scryfall_cards,
    replicationIdentifier: "scryfall-card-pull-replication",
    pull: {
      async handler(checkpointOrNull, batchSize) {
        // Convert undefined to null for oRPC (RxDB uses undefined, oRPC uses null)
        const checkpoint = checkpointOrNull ?? null;

        const response = await client.sync.scryfallCards.pull({
          checkpoint,
          batchSize,
        });

        return {
          documents: response.documents,
          // Convert null back to undefined for RxDB
          checkpoint: response.checkpoint ?? undefined,
        };
      },
      batchSize: 100,
    },
    autoStart: true,
    // No push handler - pull-only replication (scryfall cards are read-only)
    push: undefined,
    // No live streaming for now - just one-time sync
    live: false,
    // Retry on error
    retryTime: 5000,
  });

  // Log replication events for debugging
  replicationState.error$.subscribe((error) => {
    console.error("Scryfall card replication error:", error);
  });

  replicationState.active$.subscribe((active) => {
    console.log("Scryfall card replication active:", active);
  });

  return replicationState;
}

/**
 * Triggers a one-time sync for decks.
 * Useful for manual refresh or initial load.
 */
export async function syncDecks(db: ManaVaultDatabase, client: AppRouterClient): Promise<void> {
  const replicationState = setupDeckReplication(db, client);

  // Wait for the replication to complete
  await replicationState.awaitInitialReplication();

  // Cancel the replication since we're doing a one-time sync
  await replicationState.cancel();
}

/**
 * Triggers a one-time sync for deck cards.
 * Useful for manual refresh or initial load.
 */
export async function syncDeckCards(db: ManaVaultDatabase, client: AppRouterClient): Promise<void> {
  const replicationState = setupDeckCardReplication(db, client);

  // Wait for the replication to complete
  await replicationState.awaitInitialReplication();

  // Cancel the replication since we're doing a one-time sync
  await replicationState.cancel();
}

/**
 * Triggers a one-time sync for scryfall cards.
 * Useful for manual refresh or initial load.
 */
export async function syncScryfallCards(
  db: ManaVaultDatabase,
  client: AppRouterClient,
): Promise<void> {
  const replicationState = setupScryfallCardReplication(db, client);

  // Wait for the replication to complete
  await replicationState.awaitInitialReplication();

  // Cancel the replication since we're doing a one-time sync
  await replicationState.cancel();
}

export async function executeInitialSync(db: ManaVaultDatabase, client: AppRouterClient) {
  await Promise.allSettled([
    syncDecks(db, client),
    syncDeckCards(db, client),
    syncScryfallCards(db, client),
  ]);
}
