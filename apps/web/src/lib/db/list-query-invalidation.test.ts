// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import type { QueryKey } from "@tanstack/react-query";

import { createListQueryInvalidator } from "./list-query-invalidation";

class RecordingQueryClient {
  readonly invalidatedKeys: QueryKey[] = [];

  invalidateQueries({ queryKey }: { queryKey: QueryKey }): Promise<void> {
    this.invalidatedKeys.push(queryKey);
    return Promise.resolve();
  }
}

const queryKeys = {
  all: ["lists"],
  summaries: ["lists", "list"],
  detail: (listId: string) => ["lists", "get", listId],
  cards: (listId: string) => ["lists", "getCards", listId],
} satisfies Parameters<typeof createListQueryInvalidator>[1];

describe("createListQueryInvalidator", () => {
  test("invalidates summaries only when another client creates a list", async () => {
    const queryClient = new RecordingQueryClient();
    const invalidate = createListQueryInvalidator(queryClient, queryKeys);

    await invalidate({ listId: "list-1", kind: "created" });

    expect(queryClient.invalidatedKeys).toEqual([["lists", "list"]]);
  });

  test("invalidates summaries and detail when list metadata changes", async () => {
    const queryClient = new RecordingQueryClient();
    const invalidate = createListQueryInvalidator(queryClient, queryKeys);

    await invalidate({ listId: "list-1", kind: "updated" });

    expect(queryClient.invalidatedKeys).toEqual([
      ["lists", "list"],
      ["lists", "get", "list-1"],
    ]);
  });

  test("invalidates summaries, detail, and cards when card contents change", async () => {
    const queryClient = new RecordingQueryClient();
    const invalidate = createListQueryInvalidator(queryClient, queryKeys);

    await invalidate({ listId: "list-1", kind: "cardsChanged" });

    expect(queryClient.invalidatedKeys).toEqual([
      ["lists", "list"],
      ["lists", "get", "list-1"],
      ["lists", "getCards", "list-1"],
    ]);
  });

  test("invalidates summaries, detail, and cards when a list is deleted", async () => {
    const queryClient = new RecordingQueryClient();
    const invalidate = createListQueryInvalidator(queryClient, queryKeys);

    await invalidate({ listId: "list-1", kind: "deleted" });

    expect(queryClient.invalidatedKeys).toEqual([
      ["lists", "list"],
      ["lists", "get", "list-1"],
      ["lists", "getCards", "list-1"],
    ]);
  });

  test("invalidates the full lists namespace after reconnect", async () => {
    const queryClient = new RecordingQueryClient();
    const invalidate = createListQueryInvalidator(queryClient, queryKeys);

    await invalidate();

    expect(queryClient.invalidatedKeys).toEqual([["lists"]]);
  });
});
