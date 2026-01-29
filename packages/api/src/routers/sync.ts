import { eventIterator } from "@orpc/server";
import z from "zod";

import { protectedProcedure } from "../index";
import { deckPublisher, deckCardPublisher } from "../publishers/deck-publisher";
import {
  storageContainerPublisher,
  collectionCardPublisher,
  collectionCardLocationPublisher,
} from "../publishers/collection-publisher";
import {
  mergeAsyncIterables,
  type MultiplexedStreamEvent,
} from "../publishers/multiplexed-publisher";

/**
 * Schema for multiplexed stream events.
 * Uses z.custom since the event types are complex unions.
 */
const multiplexedEventSchema = z.custom<MultiplexedStreamEvent>();

/**
 * Sync router providing a multiplexed SSE endpoint that combines all entity streams.
 *
 * This reduces the number of concurrent SSE connections from 5 to 1,
 * staying well within the browser's ~6 connection per origin limit.
 *
 * Clients use the demultiplexer to route events to the appropriate RxDB collection.
 */
export const syncRouter = {
  /**
   * Multiplexed stream endpoint for live replication.
   * Combines deck, deckCard, storageContainer, collectionCard, and collectionCardLocation
   * streams into a single SSE connection.
   *
   * Each event is tagged with its entity type for client-side routing.
   *
   * @see https://rxdb.info/replication-http.html#pullstream-for-ongoing-changes
   */
  stream: protectedProcedure
    .output(eventIterator(multiplexedEventSchema))
    .handler(async function* ({ context, signal }) {
      const userId = context.session.user.id;

      // Create a map of entity type to publisher subscription
      // Use explicit type to handle heterogeneous event types
      const publishers = new Map<string, AsyncIterable<unknown>>([
        ["deck", deckPublisher.subscribe(userId, { signal })],
        ["deckCard", deckCardPublisher.subscribe(userId, { signal })],
        ["storageContainer", storageContainerPublisher.subscribe(userId, { signal })],
        ["collectionCard", collectionCardPublisher.subscribe(userId, { signal })],
        ["collectionCardLocation", collectionCardLocationPublisher.subscribe(userId, { signal })],
      ]);

      // Merge all publisher streams and yield typed events
      for await (const { key, value } of mergeAsyncIterables(publishers)) {
        yield { type: key, event: value } as MultiplexedStreamEvent;
      }
    }),
};
