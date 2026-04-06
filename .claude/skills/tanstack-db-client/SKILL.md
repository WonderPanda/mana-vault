---
name: tanstack-db-client
description: >
  TanStack DB client-side reactive data patterns for Mana Vault. Use when working with
  useLiveQuery hooks, client-side collections, RxDB/Dexie sync, or any reactive data
  queries in the web app. Covers hook locations, DB setup, and query builder best practices.
---

# TanStack DB (Client-Side Data)

The web app uses TanStack DB (backed by RxDB/Dexie) for reactive, local-first data on the client. Collections, collection cards, decks, deck cards, and scryfall card data are all synced to a local database and queried via `useLiveQuery`.

- **Hooks live in**: `apps/web/src/hooks/` (e.g., `use-collection-cards.ts`, `use-deck-cards-by-category.ts`)
- **DB setup**: `apps/web/src/lib/db/db.ts` (schemas, collections, replication)
- **DB context**: `apps/web/src/lib/db/db-context.ts` (provides collections to hooks)

**Important: Fully leverage TanStack DB queries.** All filtering, sorting, joining, and data shaping for client-side data should be done _within_ the `useLiveQuery` query builder (using `.where()`, `.orderBy()`, `.select()`, `.innerJoin()`, `.fn.where()`, `.fn.select()`, etc.). Do **not** chain `.sort()`, `.filter()`, `useMemo`, or other post-processing on the results of a TanStack DB query. If the query builder doesn't support what you need directly, use `.fn` methods (e.g., `.fn.where()`, `.fn.select()`) which are part of the query and remain reactive.

```typescript
// GOOD - sorting inside the TanStack DB query
useLiveQuery(
  (q) =>
    q
      .from({ collectionCard: collectionCardCollection })
      .innerJoin(...)
      .orderBy(({ collectionCard, card }) =>
        collectionCard.isFoil ? (card.priceUsdFoil ?? 0) : (card.priceUsd ?? 0),
        "desc",
      )
      .select(...),
  [deps],
);

// BAD - sorting after the query results
const { data } = useLiveQuery(...);
const sorted = useMemo(() => data?.sort(...), [data]); // Don't do this
```
