// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import type { VirtualListChangeEvent } from "@mana-vault/api/publishers/virtual-list-publisher";
import type { WebAppRouterClient } from "@/utils/orpc";

import { createDemultiplexedStreams } from "./multiplexed-replication";

function eventsIterable(events: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* events;
    },
  };
}

describe("createDemultiplexedStreams", () => {
  test("routes virtual-list events to the query invalidator", async () => {
    const event = {
      listId: "list-1",
      kind: "cardsChanged",
    } satisfies VirtualListChangeEvent;
    const invalidated = Promise.withResolvers<VirtualListChangeEvent | undefined>();
    const client = {
      sync: {
        stream: async () => eventsIterable([{ type: "virtualList", event }]),
      },
    } as unknown as WebAppRouterClient;

    createDemultiplexedStreams(client, {
      invalidateListQueries: async (receivedEvent) => invalidated.resolve(receivedEvent),
    });

    expect(await invalidated.promise).toEqual(event);
  });

  test("invalidates all list queries after a successful stream reconnect", async () => {
    const invalidated = Promise.withResolvers<VirtualListChangeEvent | undefined>();
    const client = {
      sync: {
        stream: async (
          _input: unknown,
          options: {
            context: {
              onRetry(args: { attemptIndex: number; error: Error }): (isSuccess: boolean) => void;
            };
          },
        ) => {
          const retryCompleted = options.context.onRetry({
            attemptIndex: 0,
            error: new Error("disconnected"),
          });
          retryCompleted(true);
          return eventsIterable([]);
        },
      },
    } as unknown as WebAppRouterClient;

    createDemultiplexedStreams(client, {
      invalidateListQueries: async (event) => invalidated.resolve(event),
    });

    expect(await invalidated.promise).toBeUndefined();
  });
});
