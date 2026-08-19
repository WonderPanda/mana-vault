import { eventIterator } from "@orpc/server";
import z from "zod";

import { protectedProcedure } from "../index";
import type { MultiplexedStreamEvent } from "../publishers/sync-event-bus";

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
   * Receives the user's multiplexed events from a shared Durable Object channel.
   *
   * Each event is tagged with its entity type for client-side routing.
   *
   * @see https://rxdb.info/replication-http.html#pullstream-for-ongoing-changes
   */
  stream: protectedProcedure
    .output(eventIterator(multiplexedEventSchema))
    .handler(async function* ({ context, signal, lastEventId }) {
      const userId = context.session.user.id;

      for await (const event of context.syncEvents.subscribe(userId, { signal, lastEventId })) {
        yield event;
      }
    }),
};
