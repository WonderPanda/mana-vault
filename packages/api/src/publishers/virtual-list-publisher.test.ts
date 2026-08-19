// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import type {
  MultiplexedStreamEvent,
  SyncEntityType,
  SyncEventBus,
  SyncEventMap,
  SyncEventSubscriptionOptions,
} from "./sync-event-bus";
import { publishVirtualListChange } from "./virtual-list-publisher";

class RecordingSyncEventBus implements SyncEventBus {
  readonly publications: Array<{ userId: string; event: MultiplexedStreamEvent }> = [];

  publish<Type extends SyncEntityType>(
    userId: string,
    type: Type,
    event: SyncEventMap[Type],
  ): Promise<void> {
    this.publications.push({ userId, event: { type, event } as MultiplexedStreamEvent });
    return Promise.resolve();
  }

  async *subscribe(
    _userId: string,
    _options?: SyncEventSubscriptionOptions,
  ): AsyncIterable<MultiplexedStreamEvent> {}
}

describe("publishVirtualListChange", () => {
  test("publishes the affected list and change kind on the user's channel", async () => {
    const eventBus = new RecordingSyncEventBus();

    await publishVirtualListChange(eventBus, "user-1", "list-1", "cardsChanged");

    expect(eventBus.publications).toEqual([
      {
        userId: "user-1",
        event: {
          type: "virtualList",
          event: { listId: "list-1", kind: "cardsChanged" },
        },
      },
    ]);
  });
});
