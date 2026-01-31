import type { DeckStreamEvent, DeckCardStreamEvent } from "./deck-publisher";
import type {
  StorageContainerStreamEvent,
  CollectionCardStreamEvent,
  CollectionCardLocationStreamEvent,
} from "./collection-publisher";
import type { TagStreamEvent } from "./tag-publisher";

// =============================================================================
// Multiplexed Stream Types
// =============================================================================

/**
 * Entity types supported by the multiplexed stream.
 * Each maps to a specific RxDB collection.
 */
export type MultiplexedEntityType =
  | "deck"
  | "deckCard"
  | "storageContainer"
  | "collectionCard"
  | "collectionCardLocation"
  | "tag";

/**
 * Multiplexed stream event format.
 * Wraps individual entity events with their type for client-side routing.
 */
export type MultiplexedStreamEvent =
  | { type: "deck"; event: DeckStreamEvent }
  | { type: "deckCard"; event: DeckCardStreamEvent }
  | { type: "storageContainer"; event: StorageContainerStreamEvent }
  | { type: "collectionCard"; event: CollectionCardStreamEvent }
  | { type: "collectionCardLocation"; event: CollectionCardLocationStreamEvent }
  | { type: "tag"; event: TagStreamEvent };

// =============================================================================
// Async Iterable Merge Helper
// =============================================================================

/**
 * Merges multiple async iterables into a single stream.
 * Uses Promise.race to emit values from any iterator as they become available.
 *
 * @param iterables - Map of key to async iterable
 * @yields Objects containing the key and value from whichever iterator yields first
 */
export async function* mergeAsyncIterables<T>(
  iterables: Map<string, AsyncIterable<T>>,
): AsyncGenerator<{ key: string; value: T }> {
  const iterators = new Map<string, AsyncIterator<T>>();
  const pending = new Map<string, Promise<{ key: string; result: IteratorResult<T> }>>();

  // Initialize iterators and their first pending promises
  for (const [key, iterable] of iterables) {
    const iterator = iterable[Symbol.asyncIterator]();
    iterators.set(key, iterator);
    pending.set(
      key,
      iterator.next().then((result) => ({ key, result })),
    );
  }

  // Continue while there are any active iterators
  while (pending.size > 0) {
    // Race all pending promises to get the next available value
    const { key, result } = await Promise.race(pending.values());

    if (result.done) {
      // This iterator is exhausted, remove it
      pending.delete(key);
      iterators.delete(key);
    } else {
      // Yield the value with its source key
      yield { key, value: result.value };

      // Queue up the next value from this iterator
      const iterator = iterators.get(key)!;
      pending.set(
        key,
        iterator.next().then((r) => ({ key, result: r })),
      );
    }
  }
}
