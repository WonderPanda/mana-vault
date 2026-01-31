# Multiplexed SSE Streaming

## Table of Contents

- [Problem](#problem)
- [Architecture](#architecture)
- [Server: mergeAsyncIterables Helper](#server-mergeasynciterables-helper)
- [Server: Multiplexed Stream Types](#server-multiplexed-stream-types)
- [Server: Sync Router](#server-sync-router)
- [Client: Demultiplexer](#client-demultiplexer)

## Problem

Browsers enforce a ~6 concurrent connection limit per origin. Without multiplexing, each syncable entity needs its own SSE connection. With 5+ entities, you hit the limit and block other HTTP requests (API calls, asset loading).

**Solution**: Combine all entity SSE streams into a single multiplexed connection. Tag each event with its entity type and demultiplex on the client.

## Architecture

```
Server                              Client
┌──────────────────┐                ┌──────────────────────┐
│ entityAPublisher ─┐               │ ┌─ entityA$ (Subject) │
│ entityBPublisher ─┼─ merge ─ SSE ─┼─┤─ entityB$ (Subject) │
│ entityCPublisher ─┘  (single     │ └─ entityC$ (Subject) │
│                      connection)  │    (demultiplexed)    │
└──────────────────┘                └──────────────────────┘
```

## Server: mergeAsyncIterables Helper

Merges multiple async iterables into a single stream using `Promise.race`:

```typescript
// packages/api/src/publishers/multiplexed-publisher.ts

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

  // Race all pending promises — whichever yields first wins
  while (pending.size > 0) {
    const { key, result } = await Promise.race(pending.values());

    if (result.done) {
      pending.delete(key);
      iterators.delete(key);
    } else {
      yield { key, value: result.value };

      // Queue next value from this iterator
      const iterator = iterators.get(key)!;
      pending.set(
        key,
        iterator.next().then((r) => ({ key, result: r })),
      );
    }
  }
}
```

## Server: Multiplexed Stream Types

Define a discriminated union for the multiplexed events:

```typescript
// packages/api/src/publishers/multiplexed-publisher.ts
import type { EntityAStreamEvent } from "./entity-a-publisher";
import type { EntityBStreamEvent } from "./entity-b-publisher";
import type { EntityCStreamEvent } from "./entity-c-publisher";

export type MultiplexedEntityType = "entityA" | "entityB" | "entityC";

export type MultiplexedStreamEvent =
  | { type: "entityA"; event: EntityAStreamEvent }
  | { type: "entityB"; event: EntityBStreamEvent }
  | { type: "entityC"; event: EntityCStreamEvent };
```

## Server: Sync Router

A single SSE endpoint subscribes to all publishers and merges them:

```typescript
// packages/api/src/routers/sync.ts
import { eventIterator } from "@orpc/server";
import z from "zod";

import { protectedProcedure } from "../index";
import { entityAPublisher } from "../publishers/entity-a-publisher";
import { entityBPublisher } from "../publishers/entity-b-publisher";
import { entityCPublisher } from "../publishers/entity-c-publisher";
import {
  mergeAsyncIterables,
  type MultiplexedStreamEvent,
} from "../publishers/multiplexed-publisher";

const multiplexedEventSchema = z.custom<MultiplexedStreamEvent>();

export const syncRouter = {
  stream: protectedProcedure
    .output(eventIterator(multiplexedEventSchema))
    .handler(async function* ({ context, signal }) {
      const userId = context.session.user.id;

      // Subscribe to ALL publishers in one map
      // Use `unknown` for heterogeneous event types
      const publishers = new Map<string, AsyncIterable<unknown>>([
        ["entityA", entityAPublisher.subscribe(userId, { signal })],
        ["entityB", entityBPublisher.subscribe(userId, { signal })],
        ["entityC", entityCPublisher.subscribe(userId, { signal })],
      ]);

      // Merge all streams and yield tagged events
      for await (const { key, value } of mergeAsyncIterables(publishers)) {
        yield { type: key, event: value } as MultiplexedStreamEvent;
      }
    }),
};
```

Register the sync router in your app router:

```typescript
// packages/api/src/routers/index.ts
import { syncRouter } from "./sync";

export const appRouter = {
  // ... entity routers with their sync.pull endpoints
  sync: syncRouter,
};
```

## Client: Demultiplexer

Connects to the single multiplexed endpoint and routes events to per-entity RxJS Subjects:

```typescript
// apps/web/src/lib/db/multiplexed-replication.ts
import { Subject } from "rxjs";

import type { RxReplicationPullStreamItem } from "rxdb";
import type { EntityADoc, EntityBDoc, EntityCDoc } from "./db";
import type { ReplicationCheckpoint } from "./replication";
import type { AppRouterClient } from "@my-app/api/routers/index";

export interface DemultiplexedStreams {
  entityA$: Subject<RxReplicationPullStreamItem<EntityADoc, ReplicationCheckpoint>>;
  entityB$: Subject<RxReplicationPullStreamItem<EntityBDoc, ReplicationCheckpoint>>;
  entityC$: Subject<RxReplicationPullStreamItem<EntityCDoc, ReplicationCheckpoint>>;
}

export function createDemultiplexedStreams(client: AppRouterClient): DemultiplexedStreams {
  const streams: DemultiplexedStreams = {
    entityA$: new Subject(),
    entityB$: new Subject(),
    entityC$: new Subject(),
  };

  const emitResyncToAll = () => {
    streams.entityA$.next("RESYNC");
    streams.entityB$.next("RESYNC");
    streams.entityC$.next("RESYNC");
  };

  // Consume the multiplexed stream in the background
  (async () => {
    try {
      const iterator = await client.sync.stream({});

      for await (const multiplexedEvent of iterator) {
        const { type, event } = multiplexedEvent;

        // Handle RESYNC signal (used after bulk imports)
        if (event === "RESYNC") {
          switch (type) {
            case "entityA": streams.entityA$.next("RESYNC"); break;
            case "entityB": streams.entityB$.next("RESYNC"); break;
            case "entityC": streams.entityC$.next("RESYNC"); break;
          }
          continue;
        }

        // Route document events to the correct Subject
        if (event.checkpoint !== null) {
          switch (type) {
            case "entityA":
              streams.entityA$.next({
                documents: event.documents,
                checkpoint: event.checkpoint,
              });
              break;
            case "entityB":
              streams.entityB$.next({
                documents: event.documents,
                checkpoint: event.checkpoint,
              });
              break;
            case "entityC":
              streams.entityC$.next({
                documents: event.documents,
                checkpoint: event.checkpoint,
              });
              break;
          }
        }
      }
    } catch (error) {
      console.error("[Multiplexed Stream] Connection error, triggering RESYNC:", error);
      emitResyncToAll();
    }
  })();

  return streams;
}
```

### Key Design Decisions

- **RxJS Subjects** are used because RxDB's `pull.stream$` expects an Observable. Subjects act as both Observable and manual emitter.
- **`"RESYNC"` on error**: When the SSE connection drops, all streams get RESYNC, causing RxDB to fall back to checkpoint-based pull iteration.
- **Null checkpoint filtering**: RxDB expects non-null checkpoints in stream events. Events with `checkpoint: null` are skipped.
- **Background async IIFE**: The stream consumption runs in the background. The function returns the Subjects immediately so replication can be wired up.
