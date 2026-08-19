// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import type {
  MultiplexedStreamEvent,
  SyncEntityType,
  SyncEventBus,
  SyncEventMap,
  SyncEventSubscriptionOptions,
} from "../publishers/sync-event-bus";
import type {
  DeckLifecycleRecord,
  DeckReplicationLifecycleStore,
} from "./deck-replication-lifecycle";
import { assertDeckCardParentsExist, deleteDeckForReplication } from "./deck-replication-lifecycle";

const deckRecord: DeckLifecycleRecord = {
  id: "deck-1",
  name: "Offline deck",
  format: "commander",
  status: "in_progress",
  archetype: null,
  colorIdentity: null,
  description: null,
  isPublic: false,
  sortOrder: 0,
  createdAt: new Date(100),
  updatedAt: new Date(200),
};

class RecordingStore implements DeckReplicationLifecycleStore {
  softDeleted = false;
  activeDeckIds = [deckRecord.id];

  async findActiveDeck(_userId: string, deckId: string) {
    return deckId === deckRecord.id ? deckRecord : undefined;
  }

  async findActiveDeckIds(_userId: string, _deckIds: string[]) {
    return this.activeDeckIds;
  }

  async softDeleteDeckAndCards(_deckId: string, deletedAt: Date) {
    this.softDeleted = true;
    return {
      deck: { ...deckRecord, updatedAt: deletedAt },
      deletedCardCount: 2,
      deletedLocationCount: 1,
    };
  }
}

class RecordingEventBus implements SyncEventBus {
  publications: Array<{ userId: string; event: MultiplexedStreamEvent }> = [];

  publish<Type extends SyncEntityType>(
    userId: string,
    type: Type,
    event: SyncEventMap[Type],
  ): Promise<void> {
    this.publications.push({
      userId,
      event: { type, event } as MultiplexedStreamEvent,
    });
    return Promise.resolve();
  }

  async *subscribe(
    _userId: string,
    _options?: SyncEventSubscriptionOptions,
  ): AsyncIterable<MultiplexedStreamEvent> {}
}

describe("deck replication lifecycle", () => {
  test("soft-deletes a deck and its cards before publishing durable reconciliation events", async () => {
    const store = new RecordingStore();
    const eventBus = new RecordingEventBus();
    const deletedAt = new Date(300);

    await deleteDeckForReplication(store, eventBus, "user-1", deckRecord.id, deletedAt);

    expect(store.softDeleted).toBe(true);
    expect(eventBus.publications).toEqual([
      {
        userId: "user-1",
        event: {
          type: "deck",
          event: {
            documents: [
              {
                id: "deck-1",
                name: "Offline deck",
                format: "commander",
                status: "in_progress",
                archetype: null,
                colorIdentity: null,
                description: null,
                isPublic: false,
                sortOrder: 0,
                createdAt: 100,
                updatedAt: 300,
                _deleted: true,
              },
            ],
            checkpoint: { id: "deck-1", updatedAt: 300 },
          },
        },
      },
      { userId: "user-1", event: { type: "deckCard", event: "RESYNC" } },
      {
        userId: "user-1",
        event: { type: "collectionCardLocation", event: "RESYNC" },
      },
    ]);
  });

  test("rejects deck-card pushes until every parent deck exists", async () => {
    const store = new RecordingStore();
    store.activeDeckIds = ["deck-1"];

    expect(
      assertDeckCardParentsExist(store, "user-1", ["deck-1", "missing-deck"]),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});
