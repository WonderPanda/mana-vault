# Client Replication Configuration

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Pull Stream Creation](#pull-stream-creation)
- [Replication Setup (Per-Entity)](#replication-setup-per-entity)
- [Multiplexed Replication Setup](#multiplexed-replication-setup)
- [Cross-Entity Sync Triggers](#cross-entity-sync-triggers)
- [Initial Sync Utilities](#initial-sync-utilities)
- [Integration with Database Init](#integration-with-database-init)

## Overview

RxDB replication connects client-side IndexedDB to server sync endpoints:

- **Pull handler**: Fetches documents via checkpoint-based pagination (oRPC call)
- **Pull stream**: Receives real-time updates via SSE (RxJS Subject)
- **Push handler**: Sends client-created/modified documents to the server
- **RESYNC**: Triggers re-sync after bulk operations or connection loss

## Dependencies

```typescript
import { replicateRxCollection } from "rxdb/plugins/replication";
import { Subject } from "rxjs";

import type { RxReplicationState } from "rxdb/plugins/replication";
import type { RxReplicationPullStreamItem } from "rxdb";
```

## Pull Stream Creation

Converts an oRPC SSE async iterator to an RxJS Subject for RxDB:

### Standard Pull Stream

```typescript
// apps/web/src/lib/db/replication.ts

function createPullStream<RxDocType extends { _deleted: boolean }, CheckpointType>(
  streamFn: () => Promise<
    AsyncIterable<{
      documents: RxDocType[];
      checkpoint: CheckpointType | null;
    }>
  >,
): Subject<RxReplicationPullStreamItem<RxDocType, CheckpointType>> {
  const subject = new Subject<RxReplicationPullStreamItem<RxDocType, CheckpointType>>();

  (async () => {
    try {
      const iterator = await streamFn();
      for await (const event of iterator) {
        if (event.checkpoint !== null) {
          subject.next({
            documents: event.documents,
            checkpoint: event.checkpoint,
          });
        }
      }
    } catch (error) {
      console.error("Pull stream error, triggering RESYNC:", error);
      subject.next("RESYNC");
    }
  })();

  return subject;
}
```

### RESYNC-Capable Pull Stream

For entities whose server stream can emit `"RESYNC"` (bulk operations):

```typescript
function createPullStreamWithResync<RxDocType extends { _deleted: boolean }, CheckpointType>(
  streamFn: () => Promise<
    AsyncIterable<
      | { documents: RxDocType[]; checkpoint: CheckpointType | null }
      | "RESYNC"
    >
  >,
): Subject<RxReplicationPullStreamItem<RxDocType, CheckpointType>> {
  const subject = new Subject<RxReplicationPullStreamItem<RxDocType, CheckpointType>>();

  (async () => {
    try {
      const iterator = await streamFn();
      for await (const event of iterator) {
        if (event === "RESYNC") {
          subject.next("RESYNC");
          continue;
        }
        if (event.checkpoint !== null) {
          subject.next({
            documents: event.documents,
            checkpoint: event.checkpoint,
          });
        }
      }
    } catch (error) {
      console.error("Pull stream error:", error);
      subject.next("RESYNC");
    }
  })();

  return subject;
}
```

## Replication Setup (Per-Entity)

```typescript
export interface ReplicationCheckpoint {
  id: string;
  updatedAt: number;
}

export function setupEntityReplication(
  db: MyAppDatabase,
  client: AppRouterClient,
): RxReplicationState<EntityDoc, ReplicationCheckpoint> {
  const pullStream$ = createPullStream<EntityDoc, ReplicationCheckpoint>(() =>
    client.entities.sync.stream({}),
  );

  return replicateRxCollection<EntityDoc, ReplicationCheckpoint>({
    collection: db.entities,
    replicationIdentifier: "entity-pull-replication",

    pull: {
      async handler(checkpointOrNull, batchSize) {
        // RxDB uses undefined, oRPC uses null
        const checkpoint = checkpointOrNull ?? null;
        const response = await client.entities.sync.pull({ checkpoint, batchSize });
        return {
          documents: response.documents,
          checkpoint: response.checkpoint ?? undefined, // Convert back
        };
      },
      batchSize: 50,
      stream$: pullStream$,
    },

    autoStart: true,
    push: undefined,  // Pull-only — see push-replication.md for push
    live: true,
    retryTime: 5000,
  });
}
```

### Key: undefined/null Conversion

RxDB uses `undefined` for "no checkpoint", oRPC/Zod uses `null`. Convert at the boundary:

- **Before oRPC call**: `checkpointOrNull ?? null`
- **After oRPC response**: `response.checkpoint ?? undefined`

## Multiplexed Replication Setup

When using multiplexed streaming (recommended for 3+ entities), pass the demultiplexed Subjects instead of per-entity streams:

```typescript
import { createDemultiplexedStreams } from "./multiplexed-replication";

export function setupReplicationsWithMultiplexedStream(
  db: MyAppDatabase,
  client: AppRouterClient,
) {
  // Single SSE connection, demultiplexed into per-entity Subjects
  const streams = createDemultiplexedStreams(client);

  const entityAReplication = replicateRxCollection<EntityADoc, ReplicationCheckpoint>({
    collection: db.entity_a,
    replicationIdentifier: "entity-a-replication",
    deletedField: "_deleted",
    pull: {
      async handler(checkpointOrNull, batchSize) {
        const checkpoint = checkpointOrNull ?? null;
        const response = await client.entityA.sync.pull({ checkpoint, batchSize });
        return { documents: response.documents, checkpoint: response.checkpoint ?? undefined };
      },
      batchSize: 50,
      stream$: streams.entityA$,  // From demultiplexer
    },
    autoStart: true,
    push: undefined,
    live: true,
    retryTime: 5000,
  });

  const entityBReplication = replicateRxCollection<EntityBDoc, ReplicationCheckpoint>({
    collection: db.entity_b,
    replicationIdentifier: "entity-b-replication",
    deletedField: "_deleted",
    pull: {
      async handler(checkpointOrNull, batchSize) {
        const checkpoint = checkpointOrNull ?? null;
        const response = await client.entityB.sync.pull({ checkpoint, batchSize });
        return { documents: response.documents, checkpoint: response.checkpoint ?? undefined };
      },
      batchSize: 100,  // Larger batch for child entities
      stream$: streams.entityB$,
    },
    autoStart: true,
    push: undefined,
    live: true,
    retryTime: 5000,
  });

  return { entityAReplication, entityBReplication };
}
```

## Cross-Entity Sync Triggers

Some entities depend on others. For example, if entity B references data in entity C (a shared lookup table), trigger entity C's sync when entity B changes:

```typescript
const { entityBReplication, entityCReplication } = setupReplications(db, client);

const triggerEntityCSync = async () => {
  entityCReplication.reSync();
  try {
    await entityCReplication.awaitInSync();
  } catch {
    // Will retry automatically via retryTime
  }
};

// When entity B replicates new data, ensure entity C is up to date
entityBReplication.received$.subscribe(triggerEntityCSync);
```

This is useful when entity C doesn't have its own live stream (e.g., it syncs on-demand only).

## Initial Sync Utilities

One-shot sync functions for initial data loading:

```typescript
export async function syncEntities(db: MyAppDatabase, client: AppRouterClient): Promise<void> {
  const replicationState = setupEntityReplication(db, client);
  await replicationState.awaitInitialReplication();
  await replicationState.cancel();
}

// Run all initial syncs in parallel
export async function executeInitialSync(db: MyAppDatabase, client: AppRouterClient) {
  await Promise.allSettled([
    syncEntityA(db, client),
    syncEntityB(db, client),
    syncEntityC(db, client),
  ]);
}
```

## Integration with Database Init

Wire replication into `initializeDb()`:

```typescript
// apps/web/src/lib/db/db.ts
import { setupReplicationsWithMultiplexedStream } from "./replication";
import { client } from "@/utils/orpc";

async function initializeDb() {
  const database = await createRxDatabase<DatabaseCollections>({ ... });
  await database.addCollections({ ... });

  // Start replication
  const replications = setupReplicationsWithMultiplexedStream(database, client);

  // Wire cross-entity triggers
  replications.entityBReplication.received$.subscribe(async () => {
    replications.entityCReplication.reSync();
  });

  // Bridge to TanStack DB
  const entityACollection = createCollection(
    rxdbCollectionOptions({ rxCollection: database.entity_a }),
  );

  return {
    rxdb: database,
    ...replications,
    entityACollection,
  };
}
```
