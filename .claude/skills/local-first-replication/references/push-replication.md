# Push Replication

## Table of Contents

- [When to Use Push](#when-to-use-push)
- [Server: Push Endpoint](#server-push-endpoint)
- [Client: Push Handler](#client-push-handler)
- [Conflict Resolution](#conflict-resolution)
- [Naming Conventions](#naming-conventions)

## When to Use Push

Use push replication when the client can **create or modify** entities locally (offline-capable writes). The client writes to RxDB directly, and push replication syncs those changes to the server.

**Push replication**: Client creates/edits entities -> RxDB -> push to server
**Pull-only (no push)**: Client calls oRPC mutation -> server writes to DB -> server publishes to SSE -> client pulls

Choose per-entity. Some entities may use push (user-created tags, notes) while others stay pull-only (server-managed data like imported cards).

## Server: Push Endpoint

### Zod Doc Schema

Define a schema matching the RxDB document shape for input validation:

```typescript
// packages/api/src/routers/[entity].ts
const entityDocSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  _deleted: z.boolean(),
});
```

### Push Endpoint Implementation

```typescript
export const entityRouter = {
  sync: {
    push: protectedProcedure
      .input(
        z.object({
          rows: z.array(
            z.object({
              newDocumentState: entityDocSchema,
              assumedMasterState: entityDocSchema.nullable(),
            }),
          ),
        }),
      )
      .handler(async ({ context, input }) => {
        const userId = context.session.user.id;
        const { rows } = input;
        const conflicts: z.infer<typeof entityDocSchema>[] = [];
        const changedDocs: z.infer<typeof entityDocSchema>[] = [];

        for (const row of rows) {
          const { newDocumentState, assumedMasterState } = row;

          // Look up current master state in the database
          const [currentRow] = await db
            .select()
            .from(entity)
            .where(and(eq(entity.id, newDocumentState.id), eq(entity.userId, userId)))
            .limit(1);

          if (!currentRow && !assumedMasterState) {
            // ---- CASE 1: New document (insert) ----
            const now = new Date();
            const [inserted] = await db
              .insert(entity)
              .values({
                id: newDocumentState.id,
                userId,
                name: newDocumentState.name,
                color: newDocumentState.color,
                isActive: newDocumentState.isActive,
                createdAt: now,
                updatedAt: now,
                deletedAt: newDocumentState._deleted ? now : null,
              })
              .returning();

            if (inserted) {
              changedDocs.push(toEntityReplicationDoc(inserted, newDocumentState._deleted));
            }
          } else if (currentRow) {
            // ---- CASE 2: Existing document (check + update) ----
            const masterUpdatedAt = currentRow.updatedAt.getTime();
            const assumedUpdatedAt = assumedMasterState?.updatedAt;

            if (assumedUpdatedAt === masterUpdatedAt) {
              // Assumed state matches — safe to apply
              const [updated] = await db
                .update(entity)
                .set({
                  name: newDocumentState.name,
                  color: newDocumentState.color,
                  isActive: newDocumentState.isActive,
                  deletedAt: newDocumentState._deleted ? new Date() : null,
                })
                .where(and(eq(entity.id, newDocumentState.id), eq(entity.userId, userId)))
                .returning();

              if (updated) {
                changedDocs.push(toEntityReplicationDoc(updated, newDocumentState._deleted));
              }
            } else {
              // Conflict — return current master state so client can resolve
              conflicts.push(toEntityReplicationDoc(currentRow, currentRow.deletedAt !== null));
            }
          } else {
            // ---- CASE 3: Row doesn't exist but client assumed it did ----
            // Row was deleted on server — return assumed state as deleted
            if (assumedMasterState) {
              conflicts.push({ ...assumedMasterState, _deleted: true });
            }
          }
        }

        // Publish changed docs to SSE for other connected clients
        if (changedDocs.length > 0) {
          const lastDoc = changedDocs[changedDocs.length - 1]!;
          entityPublisher.publish(userId, {
            documents: changedDocs,
            checkpoint: { id: lastDoc.id, updatedAt: lastDoc.updatedAt },
          });
        }

        return { conflicts };
      }),

    pull: protectedProcedure /* ... */,
    stream: protectedProcedure /* ... */,
  },
};
```

### Key Points

- **`rows[]`**: RxDB sends an array of change rows, each with `newDocumentState` (what the client wants to write) and `assumedMasterState` (what the client thinks the server has)
- **Conflict detection**: Compare `assumedMasterState.updatedAt` with actual DB row's `updatedAt`. Mismatch = conflict.
- **Return conflicts**: The endpoint returns `{ conflicts: [...] }`. RxDB uses this to resolve conflicts on the client (by default, master wins and the client's local copy is overwritten).
- **Publish to SSE**: After successful writes, publish the changed docs so OTHER clients of the same user also get the update.

## Client: Push Handler

Add `push` to the `replicateRxCollection` config:

```typescript
const replicationState = replicateRxCollection<EntityDoc, ReplicationCheckpoint>({
  collection: db.entities,
  replicationIdentifier: "entity-replication",  // No "-pull" suffix for bidirectional
  deletedField: "_deleted",

  pull: {
    async handler(checkpointOrNull, batchSize) {
      const checkpoint = checkpointOrNull ?? null;
      const response = await client.entities.sync.pull({ checkpoint, batchSize });
      return { documents: response.documents, checkpoint: response.checkpoint ?? undefined };
    },
    batchSize: 50,
    stream$: streams.entity$,
  },

  push: {
    async handler(changeRows) {
      const response = await client.entities.sync.push({
        rows: changeRows.map((row) => ({
          newDocumentState: row.newDocumentState,
          assumedMasterState: row.assumedMasterState ?? null,
        })),
      });
      return response.conflicts;
    },
    batchSize: 10,
  },

  autoStart: true,
  live: true,
  retryTime: 5000,
});
```

### Key Points

- **`push.handler`** receives `changeRows` from RxDB — an array of `{ newDocumentState, assumedMasterState }` objects
- **`assumedMasterState`** may be `undefined` (new doc) — convert to `null` for oRPC/Zod
- **Return value**: Must return the conflicts array. RxDB uses conflicts to update local state.
- **`push.batchSize`**: How many changes to batch per push request. Keep small (5-10) for responsive sync.

## Conflict Resolution

RxDB handles conflicts automatically with its default strategy:

1. Client pushes changes with `assumedMasterState`
2. Server compares and returns conflicts (current master state)
3. RxDB overwrites local doc with the conflict's master state
4. If the user made additional changes, a new push cycle begins

For custom conflict resolution, use RxDB's conflict handler:

```typescript
replicateRxCollection({
  // ...
  push: {
    handler: pushHandler,
    batchSize: 10,
  },
  // Custom conflict handler (optional)
  // Default behavior: master (server) wins
});
```

## Naming Conventions

- **Pull-only**: `replicationIdentifier: "entity-pull-replication"`
- **Bidirectional (pull + push)**: `replicationIdentifier: "entity-replication"` (drop the "-pull" suffix)
