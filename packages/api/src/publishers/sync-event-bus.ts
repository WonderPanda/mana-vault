import { getEventMeta, withEventMeta } from "@orpc/server";

import type { DeckCardStreamEvent, DeckStreamEvent } from "./deck-publisher";
import type {
  CollectionCardLocationStreamEvent,
  CollectionCardStreamEvent,
  StorageContainerStreamEvent,
} from "./collection-publisher";
import type { TagStreamEvent } from "./tag-publisher";

export interface SyncEventMap {
  deck: DeckStreamEvent;
  deckCard: DeckCardStreamEvent;
  storageContainer: StorageContainerStreamEvent;
  collectionCard: CollectionCardStreamEvent;
  collectionCardLocation: CollectionCardLocationStreamEvent;
  tag: TagStreamEvent;
}

export type SyncEntityType = keyof SyncEventMap;

export type MultiplexedStreamEvent = {
  [Type in SyncEntityType]: { type: Type; event: SyncEventMap[Type] };
}[SyncEntityType];

export interface SyncEventSubscriptionOptions {
  signal?: AbortSignal | null;
  lastEventId?: string;
}

/**
 * Shared seam for publishing and subscribing to authenticated user sync events.
 *
 * Implementations own transport selection, channel naming, serialization, replay,
 * and cleanup. Callers only identify the user and the typed entity event.
 */
export interface SyncEventBus {
  publish<Type extends SyncEntityType>(
    userId: string,
    type: Type,
    event: SyncEventMap[Type],
  ): Promise<void>;

  subscribe(
    userId: string,
    options?: SyncEventSubscriptionOptions,
  ): AsyncIterable<MultiplexedStreamEvent>;
}

/**
 * Adapts the multiplexed user stream to the legacy entity-specific stream routes.
 * Event metadata is retained so oRPC clients can resume from the last delivered event.
 */
export async function* subscribeToSyncEvent<Type extends SyncEntityType>(
  eventBus: SyncEventBus,
  userId: string,
  type: Type,
  options?: SyncEventSubscriptionOptions,
): AsyncGenerator<SyncEventMap[Type]> {
  for await (const message of eventBus.subscribe(userId, options)) {
    if (message.type !== type) continue;

    const event = message.event as SyncEventMap[Type];

    if (typeof event === "object" && event !== null) {
      yield withEventMeta(event, { ...getEventMeta(message) });
    } else {
      yield event;
    }
  }
}
