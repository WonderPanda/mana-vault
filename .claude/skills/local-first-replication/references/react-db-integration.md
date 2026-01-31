# @tanstack/react-db Integration

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Bridging RxDB to react-db](#bridging-rxdb-to-react-db)
- [React Context Provider](#react-context-provider)
- [Route Integration](#route-integration)
- [useLiveQuery Patterns](#uselivequery-patterns)
- [Custom Hook Patterns](#custom-hook-patterns)

## Overview

`@tanstack/react-db` provides reactive SQL-like queries over RxDB collections. The `@tanstack/rxdb-db-collection` adapter bridges RxDB to react-db's query API, enabling `useLiveQuery` in React components.

## Dependencies

```bash
bun add @tanstack/react-db @tanstack/rxdb-db-collection
```

## Bridging RxDB to react-db

Create react-db collections from RxDB collections using `createCollection` + `rxdbCollectionOptions`:

```typescript
// apps/web/src/lib/db/db.ts
import { createCollection } from "@tanstack/react-db";
import { rxdbCollectionOptions } from "@tanstack/rxdb-db-collection";

async function initializeDb() {
  const database = await createRxDatabase<DatabaseCollections>({ ... });
  await database.addCollections({ ... });

  // Bridge each RxDB collection to a TanStack DB collection
  const entityCollection = createCollection(
    rxdbCollectionOptions({ rxCollection: database.entities }),
  );
  const entityItemCollection = createCollection(
    rxdbCollectionOptions({ rxCollection: database.entity_items }),
  );
  const relatedDataCollection = createCollection(
    rxdbCollectionOptions({ rxCollection: database.related_data }),
  );

  return {
    rxdb: database,
    entityCollection,
    entityItemCollection,
    relatedDataCollection,
  };
}
```

## React Context Provider

Provide collections to the component tree:

```typescript
// apps/web/src/lib/db/db-context.tsx
import { createContext, useContext, type ReactNode } from "react";
import type { getOrCreateDb } from "./db";

type DbInstance = Awaited<ReturnType<typeof getOrCreateDb>>;

interface DbContextValue {
  entityCollection: DbInstance["entityCollection"];
  entityItemCollection: DbInstance["entityItemCollection"];
  relatedDataCollection: DbInstance["relatedDataCollection"];
}

const DbContext = createContext<DbContextValue | null>(null);

interface DbProviderProps {
  children: ReactNode;
  db: DbInstance;
}

export function DbProvider({ children, db }: DbProviderProps) {
  return (
    <DbContext
      value={{
        entityCollection: db.entityCollection,
        entityItemCollection: db.entityItemCollection,
        relatedDataCollection: db.relatedDataCollection,
      }}
    >
      {children}
    </DbContext>
  );
}

export function useDbCollections() {
  const context = useContext(DbContext);
  if (!context) {
    throw new Error("useDbCollections must be used within a DbProvider");
  }
  return context;
}
```

## Route Integration

### TanStack Router: beforeLoad + Layout Provider

Initialize the DB in the authenticated layout route's `beforeLoad` and wrap children with `DbProvider`:

```typescript
// apps/web/src/routes/(app)/_authed/route.tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { DbProvider } from "@/lib/db/db-context";
import { getOrCreateDb } from "@/lib/db/db";

export const Route = createFileRoute("/(app)/_authed")({
  component: AuthedLayout,
  beforeLoad: async ({ context: { queryClient } }) => {
    // 1. Check auth
    const session = await queryClient.ensureQueryData({
      queryKey: ["session"],
      queryFn: () => authClient.getSession(),
    });
    if (!session.data) throw redirect({ to: "/login" });

    // 2. Initialize DB singleton (creates RxDB, starts replication)
    const db = await getOrCreateDb();

    // 3. Pass db via route context
    return { session: session.data, db };
  },
});

function AuthedLayout() {
  const { db } = Route.useRouteContext();

  return (
    <DbProvider db={db}>
      <div className="layout">
        <Outlet />
      </div>
    </DbProvider>
  );
}
```

All child routes can now call `useDbCollections()` to access TanStack DB collections.

## useLiveQuery Patterns

### Simple Select All

```typescript
import { useLiveQuery } from "@tanstack/react-db";
import { useDbCollections } from "@/lib/db/db-context";

const { data } = useLiveQuery(
  (q) => q.from({ entity: entityCollection }),
  [],
);
```

### Filter with Where

```typescript
const { data } = useLiveQuery(
  (q) =>
    q
      .from({ entity: entityCollection })
      .where(({ entity }) => eq(entity.status, "active")),
  [],
);
```

### Filter by Parameter

```typescript
function EntityDetail({ entityId }: { entityId: string }) {
  const { entityCollection } = useDbCollections();

  const { data } = useLiveQuery(
    (q) =>
      q
        .from({ entity: entityCollection })
        .where(({ entity }) => eq(entity.id, entityId)),
    [entityId],  // Re-run when entityId changes
  );

  const entity = data?.[0];  // Unwrap single result from array
}
```

### Ordering

```typescript
const { data } = useLiveQuery(
  (q) =>
    q
      .from({ entity: entityCollection })
      .orderBy(({ entity }) => entity.name, "asc"),
  [],
);
```

### Inner Join

```typescript
const { data } = useLiveQuery(
  (q) =>
    q
      .from({ item: entityItemCollection })
      .innerJoin({ entity: entityCollection }, ({ entity, item }) =>
        eq(item.entityId, entity.id),
      )
      .where(({ item }) => eq(item.status, "active"))
      .orderBy(({ entity }) => entity.name, "asc")
      .select(({ item, entity }) => ({
        ...item,
        entity,  // Flatten joined data into result
      })),
  [],
);
```

### Multiple Joins

```typescript
const { data } = useLiveQuery(
  (q) =>
    q
      .from({ location: locationCollection })
      .where(({ location }) => eq(location.containerId, containerId))
      .innerJoin({ item: itemCollection }, ({ item, location }) =>
        eq(location.itemId, item.id),
      )
      .innerJoin({ related: relatedCollection }, ({ related, item }) =>
        eq(item.relatedId, related.id),
      )
      .orderBy(({ related }) => related.name, "asc")
      .select(({ item, related, location }) => ({
        ...item,
        related,
        location,
      })),
  [containerId],
);
```

### Subquery + Left Join

```typescript
const { data } = useLiveQuery(
  (q) => {
    // Subquery: distinct IDs from another collection
    const ownedIds = q
      .from({ owned: ownedCollection })
      .where(({ owned }) => eq(owned.status, "active"))
      .select(({ owned }) => ({ relatedId: owned.relatedId }))
      .distinct();

    return q
      .from({ item: itemCollection })
      .innerJoin({ related: relatedCollection }, ({ related, item }) =>
        eq(item.relatedId, related.id),
      )
      .leftJoin({ owned: ownedIds }, ({ related, owned }) =>
        eq(related.id, owned.relatedId),
      )
      .where(({ item }) => eq(item.parentId, parentId))
      .orderBy(({ related }) => related.name, "asc")
      .fn.select((row) => ({
        ...row.item,
        related: row.related,
        ownershipStatus: row.owned ? "owned" : "not-owned",
      }));
  },
  [parentId],
);
```

### Group By with Sum

```typescript
import { sum } from "@tanstack/react-db";

const { data } = useLiveQuery(
  (q) =>
    q
      .from({ item: itemCollection })
      .where(({ item }) => eq(item.parentId, parentId))
      .groupBy(({ item }) => item.parentId)
      .select(({ item }) => ({
        parentId: item.parentId,
        totalQuantity: sum(item.quantity),
      })),
  [parentId],
);
```

### Custom JavaScript Filter (fn.where)

For complex filtering not expressible with `eq`, `gt`, etc.:

```typescript
const { data } = useLiveQuery(
  (q) =>
    q
      .from({ item: itemCollection })
      .where(({ item }) => eq(item.parentId, parentId))
      .fn.where((row) => matchesCategory(row.typeLine, category))
      .orderBy(({ item }) => item.name, "asc"),
  [parentId, category],
);
```

### Custom Row Transform (fn.select)

```typescript
const { data } = useLiveQuery(
  (q) =>
    q
      .from({ item: itemCollection })
      .fn.select((row) => ({
        ...row.item,
        computedField: row.item.price * row.item.quantity,
      })),
  [],
);
```

## Custom Hook Patterns

### Single Entity by ID

```typescript
// apps/web/src/hooks/use-entities.ts
export function useEntity(entityId: string) {
  const { entityCollection } = useDbCollections();

  const { data, ...rest } = useLiveQuery(
    (q) =>
      q.from({ entity: entityCollection }).where(({ entity }) => eq(entity.id, entityId)),
    [entityId],
  );

  return { data: data?.[0], ...rest };
}
```

### Filtered List with Join

```typescript
export function useActiveEntitiesWithRelated() {
  const { entityCollection, relatedCollection } = useDbCollections();

  return useLiveQuery(
    (q) =>
      q
        .from({ entity: entityCollection })
        .innerJoin({ related: relatedCollection }, ({ related, entity }) =>
          eq(entity.relatedId, related.id),
        )
        .where(({ entity }) => eq(entity.status, "active"))
        .orderBy(({ related }) => related.name, "asc")
        .select(({ entity, related }) => ({
          ...entity,
          related,
        })),
    [],
  );
}
```

### Count

```typescript
export function useEntityCount(parentId: string) {
  const { entityCollection } = useDbCollections();

  const { data, ...rest } = useLiveQuery(
    (q) =>
      q
        .from({ entity: entityCollection })
        .where(({ entity }) => eq(entity.parentId, parentId)),
    [parentId],
  );

  return { data: data?.length ?? 0, ...rest };
}
```

### Important: Keep All Logic in the Query

All filtering, sorting, joining, and data shaping should be done _within_ the `useLiveQuery` query builder. Do **not** post-process results with `.sort()`, `.filter()`, or `useMemo` — this breaks reactivity.

```typescript
// GOOD — sorting inside the query
useLiveQuery(
  (q) => q.from({ entity: entityCollection }).orderBy(({ entity }) => entity.name, "asc"),
  [],
);

// BAD — sorting after the query
const { data } = useLiveQuery((q) => q.from({ entity: entityCollection }), []);
const sorted = useMemo(() => data?.sort(...), [data]); // Breaks reactivity
```

If the built-in operators don't support what you need, use `.fn.where()` and `.fn.select()` which remain reactive inside the query pipeline.
