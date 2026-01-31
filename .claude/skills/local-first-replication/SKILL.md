---
name: local-first-replication
description: |
  Bootstraps local-first replication architecture using RxDB + oRPC + TanStack DB in TanStack Router applications. Covers server-side EventPublisher pattern, checkpoint-based pull endpoints, push replication with conflict resolution, multiplexed SSE streaming (single connection for all entities), client-side RxDB setup with IndexedDB, replication configuration, and React integration with TanStack DB collections and useLiveQuery.
  Use when: (1) Setting up offline-first architecture from scratch, (2) Adding real-time replication to a TanStack Router + oRPC app, (3) Bootstrapping a local-first data layer, (4) Implementing multiplexed sync to avoid browser connection limits, (5) Adding push replication with conflict resolution, (6) Creating reactive queries with RxDB + TanStack DB.
  Triggers: "set up local-first", "bootstrap offline-first", "add replication architecture", "set up RxDB with oRPC", "create local-first architecture", "implement pull replication", "implement push replication", "add multiplexed sync", "set up tanstack db with rxdb", "add real-time replication", "offline-first setup".
---

# Local-First Replication Architecture

Bootstraps a complete local-first data layer: server publishes changes via SSE, client stores data in IndexedDB via RxDB, TanStack DB provides reactive queries in React.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Web)                             │
├─────────────────────────────────────────────────────────────────┤
│  React Components                                               │
│       │                                                         │
│       ▼                                                         │
│  useLiveQuery() ◄──── @tanstack/react-db                       │
│       │                                                         │
│       ▼                                                         │
│  TanStack DB Collections ◄──── @tanstack/rxdb-db-collection    │
│       │                                                         │
│       ▼                                                         │
│  RxDB (IndexedDB via Dexie) ◄──── Replication Plugin           │
│       │                          │                    │         │
│       │ (pull handler)           │ (SSE stream$)      │ (push)  │
└───────┼──────────────────────────┼────────────────────┼─────────┘
        │                          │                    │
        ▼                          ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SERVER (Hono)                            │
├─────────────────────────────────────────────────────────────────┤
│  oRPC Router                                                    │
│       │                                                         │
│       ├── sync.pull    (checkpoint-based pagination)            │
│       ├── sync.push    (conflict-aware writes)                  │
│       └── sync.stream  (multiplexed SSE via EventPublisher)     │
│               │                                                 │
│               ▼                                                 │
│  EventPublishers ◄──── Mutations publish events                 │
│               │                                                 │
│               ▼                                                 │
│  mergeAsyncIterables ──── Single SSE connection                 │
│               │                                                 │
│               ▼                                                 │
│  Drizzle ORM ◄──── SQLite / D1 / Postgres                      │
└─────────────────────────────────────────────────────────────────┘
```

## Dependencies

```bash
# Server
bun add @orpc/server drizzle-orm zod

# Client
bun add rxdb rxjs @tanstack/react-db @tanstack/rxdb-db-collection
```

## Implementation Workflow

### Step 1: Server Publishers & Sync Endpoints

For each syncable entity, create:

1. **Publisher** (`packages/api/src/publishers/[entity]-publisher.ts`)
   - `EntityReplicationDoc` interface with `_deleted` flag
   - `EventPublisher` keyed by userId
   - `toEntityReplicationDoc()` helper (Date -> timestamp ms)

2. **Sync endpoints** in router (`packages/api/src/routers/[entity].ts`)
   - `sync.pull`: Checkpoint-based pagination with `updatedAt + id` compound cursor
   - `sync.stream`: SSE endpoint using `eventIterator()` + publisher subscription

3. **Publish events** in mutation handlers (create/update/delete)

See [references/server-publishers-and-endpoints.md](references/server-publishers-and-endpoints.md) for complete patterns.

### Step 2: Multiplexed SSE Streaming

Combine all entity SSE streams into a single connection to stay within browser limits (~6 per origin).

1. **Server**: `mergeAsyncIterables()` helper + `syncRouter.stream` endpoint
2. **Client**: `createDemultiplexedStreams()` — single SSE -> per-entity RxJS Subjects
3. **Error handling**: RESYNC all streams on connection loss

See [references/multiplexed-streaming.md](references/multiplexed-streaming.md) for complete patterns.

### Step 3: Client RxDB Setup

1. **Define schemas** — JSON Schema with `_deleted: boolean`, timestamps as `number`
2. **Create database** — `createRxDatabase` with `getRxStorageDexie()`
3. **Add collections** — one per entity, with migration strategies if needed
4. **Export singleton** — `getOrCreateDb()`

See [references/client-rxdb-setup.md](references/client-rxdb-setup.md) for complete patterns.

### Step 4: Client Replication Configuration

1. **Create pull streams** — `createPullStream()` or `createPullStreamWithResync()`
2. **Setup replication** — `replicateRxCollection()` per entity with pull handler + stream$
3. **Wire multiplexed streams** — pass demultiplexed Subjects as `pull.stream$`
4. **Cross-entity triggers** — `received$.subscribe()` for dependent entities

See [references/client-replication.md](references/client-replication.md) for complete patterns.

### Step 5: Push Replication (Optional)

For entities where the client creates/modifies data locally:

1. **Server push endpoint** — `sync.push` with conflict detection via `updatedAt` comparison
2. **Client push handler** — `push.handler(changeRows)` in replication config
3. **Conflict resolution** — server returns conflicts, RxDB resolves (default: master wins)

See [references/push-replication.md](references/push-replication.md) for complete patterns.

### Step 6: React Integration

1. **Bridge to react-db** — `createCollection(rxdbCollectionOptions({ rxCollection }))`
2. **Context provider** — `DbProvider` + `useDbCollections()` hook
3. **Route integration** — init DB in `beforeLoad`, wrap layout with `DbProvider`
4. **Query with `useLiveQuery()`** — SQL-like API: `.from()`, `.where()`, `.innerJoin()`, `.select()`

See [references/react-db-integration.md](references/react-db-integration.md) for complete patterns.

## Quick Reference

### Checkpoint Schema (used everywhere)

```typescript
const checkpointSchema = z.object({ id: z.string(), updatedAt: z.number() }).nullable();
```

### Pull Handler Template

```typescript
async handler(checkpointOrNull, batchSize) {
  const checkpoint = checkpointOrNull ?? null;  // RxDB undefined -> oRPC null
  const response = await client.entity.sync.pull({ checkpoint, batchSize });
  return { documents: response.documents, checkpoint: response.checkpoint ?? undefined };
}
```

### Push Handler Template

```typescript
async handler(changeRows) {
  const response = await client.entity.sync.push({
    rows: changeRows.map((row) => ({
      newDocumentState: row.newDocumentState,
      assumedMasterState: row.assumedMasterState ?? null,
    })),
  });
  return response.conflicts;
}
```

### useLiveQuery Template

```typescript
const { data } = useLiveQuery(
  (q) => q.from({ entity: entityCollection }).where(({ entity }) => eq(entity.status, "active")),
  [/* deps */],
);
```

## File Structure

```
packages/api/src/
├── publishers/
│   ├── [entity]-publisher.ts         # EventPublisher + types + toReplicationDoc
│   └── multiplexed-publisher.ts      # mergeAsyncIterables + MultiplexedStreamEvent
├── routers/
│   ├── [entity].ts                   # sync.pull + sync.push + sync.stream
│   └── sync.ts                       # Multiplexed SSE endpoint
└── index.ts                          # protectedProcedure export

apps/web/src/lib/db/
├── db.ts                             # RxDB schemas + react-db collections + singleton
├── db-context.tsx                    # DbProvider + useDbCollections
├── replication.ts                    # Pull streams + replication setup
└── multiplexed-replication.ts        # Demultiplexer (single SSE -> per-entity Subjects)

apps/web/src/hooks/
└── use-[entity].ts                   # Custom useLiveQuery hooks
```
