import type { QueryKey } from "@tanstack/react-query";
import type { VirtualListChangeEvent } from "@mana-vault/api/publishers/virtual-list-publisher";

interface QueryInvalidationClient {
  invalidateQueries(filters: { queryKey: QueryKey }): Promise<unknown>;
}

export interface ListQueryKeys {
  all: QueryKey;
  summaries: QueryKey;
  detail(listId: string): QueryKey;
  cards(listId: string): QueryKey;
}

export function createListQueryInvalidator(
  queryClient: QueryInvalidationClient,
  queryKeys: ListQueryKeys,
) {
  return async (event?: VirtualListChangeEvent): Promise<void> => {
    if (!event) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
      return;
    }

    const keys = [queryKeys.summaries];

    if (event.kind !== "created") {
      keys.push(queryKeys.detail(event.listId));
    }

    if (event.kind === "cardsChanged" || event.kind === "deleted") {
      keys.push(queryKeys.cards(event.listId));
    }

    await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  };
}
