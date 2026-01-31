# Server-Side Publishers & Sync Endpoints (oRPC)

## Table of Contents

- [Overview](#overview)
- [Checkpoint Schema](#checkpoint-schema)
- [Publisher Pattern](#publisher-pattern)
- [Pull Endpoint Pattern](#pull-endpoint-pattern)
- [Stream Endpoint Pattern (SSE)](#stream-endpoint-pattern-sse)
- [Publishing Events on Mutations](#publishing-events-on-mutations)
- [RESYNC Pattern for Bulk Operations](#resync-pattern-for-bulk-operations)

## Overview

Each syncable entity requires:

1. A **publisher** for real-time events (`EventPublisher`)
2. A **replication document type** with `_deleted` flag
3. A **checkpoint type** using `updatedAt + id` compound cursor
4. A `sync.pull` endpoint for checkpoint-based fetching
5. A `sync.stream` endpoint for SSE live updates

## Checkpoint Schema

Use a compound key for stable cursor-based pagination:

```typescript
// packages/api/src/routers/[entity].ts
import z from "zod";

const checkpointSchema = z
  .object({
    id: z.string(),
    updatedAt: z.number(), // Timestamp in milliseconds
  })
  .nullable();

type ReplicationCheckpoint = z.infer<typeof checkpointSchema>;
```

The compound key handles edge cases where multiple documents have identical `updatedAt` timestamps.

## Publisher Pattern

Create a publisher file for each syncable entity:

```typescript
// packages/api/src/publishers/[entity]-publisher.ts
import { EventPublisher } from "@orpc/server";

// Replication document type — matches RxDB schema with _deleted flag
export interface EntityReplicationDoc {
  id: string;
  userId: string;
  name: string;
  // ... other fields matching your RxDB schema
  createdAt: number;  // Timestamp ms, not Date
  updatedAt: number;
  _deleted: boolean;  // Required for RxDB replication
}

export interface EntityReplicationCheckpoint {
  id: string;
  updatedAt: number;
}

// Standard stream event
export interface EntityStreamEvent {
  documents: EntityReplicationDoc[];
  checkpoint: EntityReplicationCheckpoint | null;
}

// Publisher keyed by userId — each user only receives their updates
export const entityPublisher = new EventPublisher<Record<string, EntityStreamEvent>>();

// Helper to convert DB row (with Date objects) to replication doc (with timestamps)
export function toEntityReplicationDoc(
  doc: {
    id: string;
    userId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    // ... other fields
  },
  deleted = false,
): EntityReplicationDoc {
  return {
    id: doc.id,
    userId: doc.userId,
    name: doc.name,
    createdAt: doc.createdAt.getTime(),
    updatedAt: doc.updatedAt.getTime(),
    _deleted: deleted,
  };
}
```

### RESYNC-Capable Publisher

For entities with bulk operations (imports, batch deletes), the stream event union includes a `"RESYNC"` literal:

```typescript
export type EntityStreamEvent =
  | {
      documents: EntityReplicationDoc[];
      checkpoint: EntityReplicationCheckpoint | null;
    }
  | "RESYNC";

export const entityPublisher = new EventPublisher<Record<string, EntityStreamEvent>>();
```

## Pull Endpoint Pattern

```typescript
// packages/api/src/routers/[entity].ts
import { protectedProcedure } from "../index";
import { and, asc, eq, gt, or } from "drizzle-orm";

export const entityRouter = {
  sync: {
    pull: protectedProcedure
      .input(
        z.object({
          checkpoint: checkpointSchema,
          batchSize: z.number().min(1).max(100).default(50),
        }),
      )
      .handler(async ({ context, input }) => {
        const userId = context.session.user.id;
        const { checkpoint, batchSize } = input;

        let documents;
        if (checkpoint) {
          // Incremental sync: documents after checkpoint
          documents = await db
            .select({
              id: entity.id,
              userId: entity.userId,
              name: entity.name,
              // ... all fields
              createdAt: entity.createdAt,
              updatedAt: entity.updatedAt,
            })
            .from(entity)
            .where(
              and(
                eq(entity.userId, userId),
                or(
                  // updatedAt strictly greater
                  gt(entity.updatedAt, new Date(checkpoint.updatedAt)),
                  // Same timestamp, id is greater (tie-breaker)
                  and(
                    eq(entity.updatedAt, new Date(checkpoint.updatedAt)),
                    gt(entity.id, checkpoint.id),
                  ),
                ),
              ),
            )
            .orderBy(asc(entity.updatedAt), asc(entity.id))
            .limit(batchSize);
        } else {
          // Initial sync: all documents for user
          documents = await db
            .select({ /* same fields */ })
            .from(entity)
            .where(eq(entity.userId, userId))
            .orderBy(asc(entity.updatedAt), asc(entity.id))
            .limit(batchSize);
        }

        // Transform: Date -> timestamp ms, add _deleted flag
        const rxdbDocuments = documents.map((doc) => ({
          ...doc,
          createdAt: doc.createdAt.getTime(),
          updatedAt: doc.updatedAt.getTime(),
          _deleted: false, // Or: doc.deletedAt !== null (for soft deletes)
        }));

        // New checkpoint from last document
        const lastDoc = rxdbDocuments[rxdbDocuments.length - 1];
        const newCheckpoint: ReplicationCheckpoint = lastDoc
          ? { id: lastDoc.id, updatedAt: lastDoc.updatedAt }
          : checkpoint;

        return { documents: rxdbDocuments, checkpoint: newCheckpoint };
      }),
  },
};
```

### Soft Delete Variation

For entities using `deletedAt` instead of hard deletes:

```typescript
const rxdbDocuments = documents.map((doc) => ({
  ...doc,
  createdAt: doc.createdAt.getTime(),
  updatedAt: doc.updatedAt.getTime(),
  _deleted: doc.deletedAt !== null,
}));
```

## Stream Endpoint Pattern (SSE)

```typescript
// packages/api/src/routers/[entity].ts
import { eventIterator } from "@orpc/server";

export const entityRouter = {
  sync: {
    // ... pull endpoint above

    stream: protectedProcedure
      .output(eventIterator(z.custom<EntityStreamEvent>()))
      .handler(async function* ({ context, signal }) {
        const userId = context.session.user.id;

        for await (const event of entityPublisher.subscribe(userId, { signal })) {
          yield event;
        }
      }),
  },
};
```

## Publishing Events on Mutations

### After Create

```typescript
create: protectedProcedure
  .input(createInputSchema)
  .handler(async ({ context, input }) => {
    const userId = context.session.user.id;

    const [newEntity] = await db
      .insert(entity)
      .values({ userId, ...input })
      .returning();

    if (newEntity) {
      const replicationDoc = toEntityReplicationDoc(newEntity);
      entityPublisher.publish(userId, {
        documents: [replicationDoc],
        checkpoint: { id: replicationDoc.id, updatedAt: replicationDoc.updatedAt },
      });
    }

    return newEntity;
  }),
```

### After Update

```typescript
update: protectedProcedure
  .input(updateInputSchema)
  .handler(async ({ context, input }) => {
    const userId = context.session.user.id;

    const [updated] = await db
      .update(entity)
      .set({ ...input.data })
      .where(and(eq(entity.id, input.id), eq(entity.userId, userId)))
      .returning();

    if (updated) {
      const replicationDoc = toEntityReplicationDoc(updated);
      entityPublisher.publish(userId, {
        documents: [replicationDoc],
        checkpoint: { id: replicationDoc.id, updatedAt: replicationDoc.updatedAt },
      });
    }

    return updated;
  }),
```

### After Delete

```typescript
delete: protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ context, input }) => {
    const userId = context.session.user.id;

    const [existing] = await db
      .select()
      .from(entity)
      .where(and(eq(entity.id, input.id), eq(entity.userId, userId)));

    if (!existing) throw new ORPCError("NOT_FOUND");

    await db.delete(entity).where(eq(entity.id, input.id));

    const now = Date.now();
    entityPublisher.publish(userId, {
      documents: [{
        id: input.id,
        userId,
        name: existing.name,
        createdAt: now,
        updatedAt: now,
        _deleted: true,
      }],
      checkpoint: { id: input.id, updatedAt: now },
    });

    return { success: true };
  }),
```

## RESYNC Pattern for Bulk Operations

For bulk imports, emit `"RESYNC"` instead of individual documents:

```typescript
bulkImport: protectedProcedure
  .input(bulkImportSchema)
  .handler(async ({ context, input }) => {
    const userId = context.session.user.id;

    let importedCount = 0;
    for (const item of input.items) {
      await db.insert(entity).values({ userId, ...item });
      importedCount++;
    }

    // Tell clients to re-sync via checkpoint iteration
    if (importedCount > 0) {
      entityPublisher.publish(userId, "RESYNC");
    }

    return { imported: importedCount };
  }),
```

`"RESYNC"` is more efficient than publishing hundreds of individual documents. The client falls back to its checkpoint-based pull handler to catch up.
