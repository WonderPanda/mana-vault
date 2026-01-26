import { replicateRxCollection } from "rxdb/plugins/replication";

import type { RxReplicationState } from "rxdb/plugins/replication";
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
 * Sets up pull-only replication for the decks collection.
 * Uses oRPC to fetch documents from the server.
 *
 * @param db - The RxDB database instance
 * @param client - The oRPC client instance
 * @returns The replication state for monitoring/control
 */
export function setupDeckReplication(
  db: ManaVaultDatabase,
  client: AppRouterClient,
): RxReplicationState<DeckDoc, ReplicationCheckpoint> {
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
    },
    autoStart: true,
    // No push handler - pull-only replication
    push: undefined,
    // No live streaming for now - just one-time sync
    live: false,
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
 * Sets up pull-only replication for the deck_cards collection.
 * Syncs all deck cards for decks owned by the user.
 *
 * @param db - The RxDB database instance
 * @param client - The oRPC client instance
 * @returns The replication state for monitoring/control
 */
export function setupDeckCardReplication(
  db: ManaVaultDatabase,
  client: AppRouterClient,
): RxReplicationState<DeckCardDoc, ReplicationCheckpoint> {
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
    },
    autoStart: true,
    // No push handler - pull-only replication
    push: undefined,
    // No live streaming for now - just one-time sync
    live: false,
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
