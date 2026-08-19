// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { getEventMeta, withEventMeta } from "@orpc/server";

import type {
  MultiplexedStreamEvent,
  SyncEntityType,
  SyncEventBus,
  SyncEventMap,
  SyncEventSubscriptionOptions,
} from "./sync-event-bus";
import { subscribeToSyncEvent } from "./sync-event-bus";

class InMemorySyncEventBus implements SyncEventBus {
  readonly events: MultiplexedStreamEvent[] = [];

  publish<Type extends SyncEntityType>(
    _userId: string,
    type: Type,
    event: SyncEventMap[Type],
  ): Promise<void> {
    this.events.push({ type, event } as MultiplexedStreamEvent);
    return Promise.resolve();
  }

  async *subscribe(
    _userId: string,
    _options?: SyncEventSubscriptionOptions,
  ): AsyncIterable<MultiplexedStreamEvent> {
    yield* this.events;
  }
}

describe("subscribeToSyncEvent", () => {
  test("filters the multiplexed stream and preserves resumable event metadata", async () => {
    const eventBus = new InMemorySyncEventBus();
    const collectionCardEvent: SyncEventMap["collectionCard"] = {
      documents: [],
      checkpoint: { id: "collection-card-1", updatedAt: 123 },
    };

    await eventBus.publish("user-1", "tag", {
      documents: [],
      checkpoint: { id: "tag-1", updatedAt: 100 },
    });
    await eventBus.publish("user-1", "collectionCard", collectionCardEvent);
    eventBus.events[1] = withEventMeta(eventBus.events[1]!, { id: "event-2" });
    await eventBus.publish("user-1", "collectionCard", "RESYNC");

    const received = [];
    for await (const event of subscribeToSyncEvent(eventBus, "user-1", "collectionCard")) {
      received.push(event);
    }

    expect(received).toEqual([collectionCardEvent, "RESYNC"]);
    expect(getEventMeta(received[0]!)).toEqual({ id: "event-2" });
  });
});
