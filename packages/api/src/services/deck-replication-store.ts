import { db } from "@mana-vault/db";
import { collectionCardLocation, deck, deckCard } from "@mana-vault/db/schema/app";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { DeckReplicationLifecycleStore } from "./deck-replication-lifecycle";

export const deckReplicationLifecycleStore: DeckReplicationLifecycleStore = {
  async findActiveDeck(userId, deckId) {
    const [result] = await db
      .select()
      .from(deck)
      .where(and(eq(deck.id, deckId), eq(deck.userId, userId), isNull(deck.deletedAt)))
      .limit(1);

    return result;
  },

  async findActiveDeckIds(userId, deckIds) {
    if (deckIds.length === 0) return [];

    const results = await db
      .select({ id: deck.id })
      .from(deck)
      .where(and(eq(deck.userId, userId), inArray(deck.id, deckIds), isNull(deck.deletedAt)));

    return results.map(({ id }) => id);
  },

  async softDeleteDeckAndCards(deckId, deletedAt) {
    const [deletedCards, deletedLocations, deletedDecks] = await db.batch([
      db
        .update(deckCard)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(deckCard.deckId, deckId), isNull(deckCard.deletedAt)))
        .returning({ id: deckCard.id }),
      db
        .update(collectionCardLocation)
        .set({ deckId: null, deletedAt, updatedAt: deletedAt })
        .where(
          and(eq(collectionCardLocation.deckId, deckId), isNull(collectionCardLocation.deletedAt)),
        )
        .returning({ id: collectionCardLocation.id }),
      db
        .update(deck)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(deck.id, deckId), isNull(deck.deletedAt)))
        .returning(),
    ]);

    return {
      deck: deletedDecks[0],
      deletedCardCount: deletedCards.length,
      deletedLocationCount: deletedLocations.length,
    };
  },
};
