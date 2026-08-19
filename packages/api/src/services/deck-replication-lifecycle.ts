import { ORPCError } from "@orpc/server";

import { toDeckReplicationDoc } from "../publishers/deck-publisher";
import type { SyncEventBus } from "../publishers/sync-event-bus";

export interface DeckLifecycleRecord {
  id: string;
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
}

export interface DeckReplicationLifecycleStore {
  findActiveDeck(userId: string, deckId: string): Promise<DeckLifecycleRecord | undefined>;
  findActiveDeckIds(userId: string, deckIds: string[]): Promise<string[]>;
  softDeleteDeckAndCards(
    deckId: string,
    deletedAt: Date,
  ): Promise<{
    deck: DeckLifecycleRecord | undefined;
    deletedCardCount: number;
    deletedLocationCount: number;
  }>;
}

export async function deleteDeckForReplication(
  store: DeckReplicationLifecycleStore,
  syncEvents: SyncEventBus,
  userId: string,
  deckId: string,
  now = new Date(),
): Promise<{ success: true; deletedDeckName: string }> {
  const existingDeck = await store.findActiveDeck(userId, deckId);

  if (!existingDeck) {
    throw new ORPCError("NOT_FOUND", { message: "Deck not found" });
  }

  const deleted = await store.softDeleteDeckAndCards(deckId, now);

  if (!deleted.deck) {
    throw new ORPCError("NOT_FOUND", { message: "Deck not found" });
  }

  const replicationDoc = toDeckReplicationDoc(deleted.deck, true);
  await syncEvents.publish(userId, "deck", {
    documents: [replicationDoc],
    checkpoint: { id: replicationDoc.id, updatedAt: replicationDoc.updatedAt },
  });

  if (deleted.deletedCardCount > 0) {
    await syncEvents.publish(userId, "deckCard", "RESYNC");
  }

  if (deleted.deletedLocationCount > 0) {
    await syncEvents.publish(userId, "collectionCardLocation", "RESYNC");
  }

  return { success: true, deletedDeckName: existingDeck.name };
}

export async function assertDeckCardParentsExist(
  store: DeckReplicationLifecycleStore,
  userId: string,
  deckIds: string[],
): Promise<void> {
  const uniqueDeckIds = [...new Set(deckIds)];
  const activeDeckIds = new Set(await store.findActiveDeckIds(userId, uniqueDeckIds));
  const missingDeckId = uniqueDeckIds.find((deckId) => !activeDeckIds.has(deckId));

  if (missingDeckId) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: `Cannot sync cards because parent deck ${missingDeckId} is unavailable`,
    });
  }
}
