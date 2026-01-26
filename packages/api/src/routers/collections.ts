import { ORPCError, eventIterator } from "@orpc/server";
import { db } from "@mana-vault/db";
import {
  storageContainer,
  collectionCard,
  collectionCardLocation,
} from "@mana-vault/db/schema/app";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { mapCondition, parseManaBoxCSV } from "../parsers/manabox";
import {
  collectionCardPublisher,
  collectionCardLocationPublisher,
  storageContainerPublisher,
  toStorageContainerReplicationDoc,
  type CollectionCardStreamEvent,
  type CollectionCardLocationStreamEvent,
  type StorageContainerStreamEvent,
} from "../publishers/collection-publisher";

/**
 * Checkpoint schema for RxDB replication.
 * Uses updatedAt (timestamp) + id for stable ordering.
 */
const checkpointSchema = z
  .object({
    id: z.string(),
    updatedAt: z.number(),
  })
  .nullable();

type ReplicationCheckpoint = z.infer<typeof checkpointSchema>;

/**
 * Check if an error is a SQLite foreign key constraint violation
 */
function isForeignKeyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("FOREIGN KEY constraint failed") ||
      error.message.includes("SQLITE_CONSTRAINT_FOREIGNKEY"))
  );
}

/**
 * Supported format identifiers for card imports.
 */
const importFormatSchema = z.enum(["manabox", "moxfield"]);

export const collectionsRouter = {
  // List all collections for the current user with card counts
  list: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session.user.id;

    const collections = await db
      .select({
        id: storageContainer.id,
        name: storageContainer.name,
        type: storageContainer.type,
        description: storageContainer.description,
        sortOrder: storageContainer.sortOrder,
        createdAt: storageContainer.createdAt,
        updatedAt: storageContainer.updatedAt,
        cardCount: sql<number>`count(${collectionCardLocation.id})`.as("card_count"),
      })
      .from(storageContainer)
      .leftJoin(
        collectionCardLocation,
        eq(collectionCardLocation.storageContainerId, storageContainer.id),
      )
      .where(eq(storageContainer.userId, userId))
      .groupBy(storageContainer.id)
      .orderBy(asc(storageContainer.sortOrder), asc(storageContainer.name));

    return collections;
  }),

  // Get a single collection by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      const collection = await db.query.storageContainer.findFirst({
        where: and(eq(storageContainer.id, input.id), eq(storageContainer.userId, userId)),
      });

      if (!collection) {
        throw new ORPCError("NOT_FOUND", { message: "Collection not found" });
      }

      return collection;
    }),

  // Create a new collection
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        type: z.enum(["box", "binder", "deck_box", "other"]).default("box"),
        description: z.string().max(500).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      const [collection] = await db
        .insert(storageContainer)
        .values({
          userId,
          name: input.name,
          type: input.type,
          description: input.description ?? null,
        })
        .returning();

      // Publish event to notify connected clients
      if (collection) {
        const replicationDoc = toStorageContainerReplicationDoc(collection);
        storageContainerPublisher.publish(userId, {
          documents: [replicationDoc],
          checkpoint: {
            id: replicationDoc.id,
            updatedAt: replicationDoc.updatedAt,
          },
        });
      }

      return collection;
    }),

  // Get cards in a specific collection
  getCards: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      // Verify user owns this collection
      const collection = await db.query.storageContainer.findFirst({
        where: and(
          eq(storageContainer.id, input.collectionId),
          eq(storageContainer.userId, userId),
        ),
      });

      if (!collection) {
        throw new ORPCError("NOT_FOUND", { message: "Collection not found" });
      }

      // Get all cards in this collection with their details
      const cards = await db.query.collectionCardLocation.findMany({
        where: eq(collectionCardLocation.storageContainerId, input.collectionId),
        with: {
          collectionCard: {
            with: {
              scryfallCard: true,
            },
          },
        },
      });

      return cards.map((location) => ({
        id: location.collectionCard.id,
        condition: location.collectionCard.condition,
        isFoil: location.collectionCard.isFoil,
        language: location.collectionCard.language,
        notes: location.collectionCard.notes,
        assignedAt: location.assignedAt,
        card: location.collectionCard.scryfallCard,
      }));
    }),

  /**
   * Import cards to the collection from CSV content.
   * Creates actual collection_card entries (source of truth for owned cards).
   * Optionally assigns them to a storage container.
   */
  importCards: protectedProcedure
    .input(
      z.object({
        /** Optional storage container to assign imported cards to */
        collectionId: z.string().optional(),
        /** Raw CSV content (either pasted or from file) */
        csvContent: z.string().min(1, "CSV content is required"),
        /** The format for selecting the appropriate parser */
        format: importFormatSchema,
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      // If a collection ID is provided, verify it exists and belongs to the user
      if (input.collectionId) {
        const collection = await db.query.storageContainer.findFirst({
          where: and(
            eq(storageContainer.id, input.collectionId),
            eq(storageContainer.userId, userId),
          ),
        });

        if (!collection) {
          throw new ORPCError("NOT_FOUND", { message: "Collection not found" });
        }
      }

      // Parse the CSV based on format
      const parseResult = parseManaBoxCSV(input.csvContent);

      if (parseResult.rows.length === 0) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            parseResult.errors.length > 0
              ? `Failed to parse CSV: ${parseResult.errors[0]?.error}`
              : "No valid rows found in CSV",
        });
      }

      let importedCount = 0;
      let skippedCount = 0;

      // Import all cards as collection cards
      // Per SCHEMA.md: Each row = one physical card (no quantity field)
      // So we create one collection_card entry per quantity
      for (const row of parseResult.rows) {
        // Create one collection card per quantity (each physical card is its own row)
        for (let i = 0; i < row.quantity; i++) {
          try {
            // Create the collection card
            const [newCard] = await db
              .insert(collectionCard)
              .values({
                userId,
                scryfallCardId: row.scryfallId,
                condition: mapCondition(row.condition),
                isFoil: row.foil === "foil" || row.foil === "etched",
                language: row.language,
                notes: row.purchasePrice
                  ? `Imported from ManaBox. Price: ${row.purchasePrice} ${row.purchasePriceCurrency || ""}`
                  : "Imported from ManaBox",
                acquiredAt: new Date(),
                status: "owned",
              })
              .returning();

            // If a collection ID is provided, create a location entry
            if (input.collectionId && newCard) {
              await db.insert(collectionCardLocation).values({
                collectionCardId: newCard.id,
                storageContainerId: input.collectionId,
              });
            }

            importedCount++;
          } catch (error) {
            // Skip cards that don't exist in the Scryfall database (foreign key constraint)
            if (isForeignKeyError(error)) {
              skippedCount++;
              console.warn(`Skipping card not found in database: ${row.scryfallId}`);
              // Break out of inner loop since all copies of this card will fail
              break;
            } else {
              throw error;
            }
          }
        }
      }

      const totalQuantity = parseResult.rows.reduce((sum, row) => sum + row.quantity, 0);

      // Trigger RESYNC for live replication subscribers after bulk import
      if (importedCount > 0) {
        collectionCardPublisher.publish(userId, "RESYNC");
        // Also trigger location resync since new cards may have been assigned to a container
        if (input.collectionId) {
          collectionCardLocationPublisher.publish(userId, "RESYNC");
        }
      }

      return {
        collectionId: input.collectionId ?? null,
        format: input.format,
        imported: importedCount,
        totalQuantity,
        skipped: skippedCount,
        parseErrors: parseResult.errors.length,
        message:
          skippedCount > 0
            ? `Successfully imported ${importedCount} cards. ${skippedCount} cards skipped (invalid Scryfall IDs).`
            : `Successfully imported ${importedCount} cards`,
      };
    }),

  /**
   * Delete a collection (storage container).
   * This only removes the storage container and unassigns cards from it.
   * Collection cards themselves are NOT deleted - they just become unassigned.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      // Verify the collection exists and belongs to the user
      const [collection] = await db
        .select({ id: storageContainer.id, name: storageContainer.name })
        .from(storageContainer)
        .where(and(eq(storageContainer.id, input.id), eq(storageContainer.userId, userId)));

      if (!collection) {
        throw new ORPCError("NOT_FOUND", { message: "Collection not found" });
      }

      // Delete the collection (card locations will have storageContainerId set to null via onDelete: "set null")
      await db.delete(storageContainer).where(eq(storageContainer.id, input.id));

      // Publish deletion event to notify connected clients
      const now = Date.now();
      storageContainerPublisher.publish(userId, {
        documents: [
          {
            id: input.id,
            userId,
            name: collection.name,
            type: "",
            description: null,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
            _deleted: true,
          },
        ],
        checkpoint: {
          id: input.id,
          updatedAt: now,
        },
      });

      return { success: true, deletedCollectionName: collection.name };
    }),

  // =============================================================================
  // Sync Endpoints for RxDB Replication
  // =============================================================================

  sync: {
    /**
     * Pull endpoint for storage container (collection) replication.
     * Returns all storage containers owned by the user.
     */
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

        // Build query conditions
        const userCondition = eq(storageContainer.userId, userId);

        let documents;
        if (checkpoint) {
          // Get documents after the checkpoint
          documents = await db
            .select({
              id: storageContainer.id,
              userId: storageContainer.userId,
              name: storageContainer.name,
              type: storageContainer.type,
              description: storageContainer.description,
              sortOrder: storageContainer.sortOrder,
              createdAt: storageContainer.createdAt,
              updatedAt: storageContainer.updatedAt,
            })
            .from(storageContainer)
            .where(
              and(
                userCondition,
                or(
                  gt(storageContainer.updatedAt, new Date(checkpoint.updatedAt)),
                  and(
                    eq(storageContainer.updatedAt, new Date(checkpoint.updatedAt)),
                    gt(storageContainer.id, checkpoint.id),
                  ),
                ),
              ),
            )
            .orderBy(asc(storageContainer.updatedAt), asc(storageContainer.id))
            .limit(batchSize);
        } else {
          // Initial sync - get all documents
          documents = await db
            .select({
              id: storageContainer.id,
              userId: storageContainer.userId,
              name: storageContainer.name,
              type: storageContainer.type,
              description: storageContainer.description,
              sortOrder: storageContainer.sortOrder,
              createdAt: storageContainer.createdAt,
              updatedAt: storageContainer.updatedAt,
            })
            .from(storageContainer)
            .where(userCondition)
            .orderBy(asc(storageContainer.updatedAt), asc(storageContainer.id))
            .limit(batchSize);
        }

        // Transform documents for RxDB (convert dates to timestamps, add _deleted flag)
        const rxdbDocuments = documents.map((doc) => ({
          id: doc.id,
          userId: doc.userId,
          name: doc.name,
          type: doc.type,
          description: doc.description,
          sortOrder: doc.sortOrder,
          createdAt: doc.createdAt.getTime(),
          updatedAt: doc.updatedAt.getTime(),
          _deleted: false,
        }));

        // Calculate new checkpoint
        const lastDoc = rxdbDocuments[rxdbDocuments.length - 1];
        const newCheckpoint: ReplicationCheckpoint = lastDoc
          ? { id: lastDoc.id, updatedAt: lastDoc.updatedAt }
          : checkpoint;

        return {
          documents: rxdbDocuments,
          checkpoint: newCheckpoint,
        };
      }),

    /**
     * Stream endpoint for live storage container replication.
     * Uses Server-Sent Events (SSE) to push real-time updates to clients.
     *
     * @see https://rxdb.info/replication-http.html#pullstream-for-ongoing-changes
     */
    stream: protectedProcedure
      .output(eventIterator(z.custom<StorageContainerStreamEvent>()))
      .handler(async function* ({ context, signal }) {
        const userId = context.session.user.id;

        // Subscribe to storage container events for this user
        for await (const event of storageContainerPublisher.subscribe(userId, { signal })) {
          yield event;
        }
      }),
  },

  cardSync: {
    /**
     * Pull endpoint for collection card replication.
     * Returns all collection cards owned by the user.
     */
    pull: protectedProcedure
      .input(
        z.object({
          checkpoint: checkpointSchema,
          batchSize: z.number().min(1).max(200).default(100),
        }),
      )
      .handler(async ({ context, input }) => {
        const userId = context.session.user.id;
        const { checkpoint, batchSize } = input;

        // Base select fields for collection cards
        const selectFields = {
          id: collectionCard.id,
          userId: collectionCard.userId,
          scryfallCardId: collectionCard.scryfallCardId,
          condition: collectionCard.condition,
          isFoil: collectionCard.isFoil,
          language: collectionCard.language,
          notes: collectionCard.notes,
          acquiredAt: collectionCard.acquiredAt,
          acquiredFrom: collectionCard.acquiredFrom,
          status: collectionCard.status,
          removedAt: collectionCard.removedAt,
          createdAt: collectionCard.createdAt,
          updatedAt: collectionCard.updatedAt,
        };

        let documents;
        if (checkpoint) {
          // Get documents after the checkpoint
          documents = await db
            .select(selectFields)
            .from(collectionCard)
            .where(
              and(
                eq(collectionCard.userId, userId),
                or(
                  gt(collectionCard.updatedAt, new Date(checkpoint.updatedAt)),
                  and(
                    eq(collectionCard.updatedAt, new Date(checkpoint.updatedAt)),
                    gt(collectionCard.id, checkpoint.id),
                  ),
                ),
              ),
            )
            .orderBy(asc(collectionCard.updatedAt), asc(collectionCard.id))
            .limit(batchSize);
        } else {
          // Initial sync - get all collection cards for user
          documents = await db
            .select(selectFields)
            .from(collectionCard)
            .where(eq(collectionCard.userId, userId))
            .orderBy(asc(collectionCard.updatedAt), asc(collectionCard.id))
            .limit(batchSize);
        }

        // Transform documents for RxDB (convert dates to timestamps, add _deleted flag)
        const rxdbDocuments = documents.map((doc) => ({
          id: doc.id,
          userId: doc.userId,
          scryfallCardId: doc.scryfallCardId,
          condition: doc.condition,
          isFoil: doc.isFoil,
          language: doc.language,
          notes: doc.notes,
          acquiredAt: doc.acquiredAt?.getTime() ?? null,
          acquiredFrom: doc.acquiredFrom,
          status: doc.status,
          removedAt: doc.removedAt?.getTime() ?? null,
          createdAt: doc.createdAt.getTime(),
          updatedAt: doc.updatedAt.getTime(),
          _deleted: false, // Collection cards use soft delete via status field
        }));

        // Calculate new checkpoint
        const lastDoc = rxdbDocuments[rxdbDocuments.length - 1];
        const newCheckpoint: ReplicationCheckpoint = lastDoc
          ? { id: lastDoc.id, updatedAt: lastDoc.updatedAt }
          : checkpoint;

        return {
          documents: rxdbDocuments,
          checkpoint: newCheckpoint,
        };
      }),

    /**
     * Stream endpoint for live collection card replication.
     * Uses Server-Sent Events (SSE) to push real-time updates to clients.
     *
     * The stream can emit:
     * - Document updates with checkpoint (for individual card changes)
     * - 'RESYNC' signal (after bulk imports to trigger full re-sync)
     *
     * @see https://rxdb.info/replication-http.html#pullstream-for-ongoing-changes
     */
    stream: protectedProcedure
      .output(eventIterator(z.custom<CollectionCardStreamEvent>()))
      .handler(async function* ({ context, signal }) {
        const userId = context.session.user.id;

        // Subscribe to collection card events for this user
        for await (const event of collectionCardPublisher.subscribe(userId, { signal })) {
          yield event;
        }
      }),
  },

  locationSync: {
    /**
     * Pull endpoint for collection card location replication.
     * Returns all card locations for the user's collection cards.
     */
    pull: protectedProcedure
      .input(
        z.object({
          checkpoint: checkpointSchema,
          batchSize: z.number().min(1).max(200).default(100),
        }),
      )
      .handler(async ({ context, input }) => {
        const userId = context.session.user.id;
        const { checkpoint, batchSize } = input;

        // Base select fields for collection card locations
        const selectFields = {
          id: collectionCardLocation.id,
          collectionCardId: collectionCardLocation.collectionCardId,
          storageContainerId: collectionCardLocation.storageContainerId,
          deckId: collectionCardLocation.deckId,
          assignedAt: collectionCardLocation.assignedAt,
        };

        let documents;
        if (checkpoint) {
          // Get documents after the checkpoint
          // Join with collection_card to filter by user
          documents = await db
            .select(selectFields)
            .from(collectionCardLocation)
            .innerJoin(
              collectionCard,
              eq(collectionCardLocation.collectionCardId, collectionCard.id),
            )
            .where(
              and(
                eq(collectionCard.userId, userId),
                or(
                  gt(collectionCardLocation.assignedAt, new Date(checkpoint.updatedAt)),
                  and(
                    eq(collectionCardLocation.assignedAt, new Date(checkpoint.updatedAt)),
                    gt(collectionCardLocation.id, checkpoint.id),
                  ),
                ),
              ),
            )
            .orderBy(asc(collectionCardLocation.assignedAt), asc(collectionCardLocation.id))
            .limit(batchSize);
        } else {
          // Initial sync - get all locations for user's collection cards
          documents = await db
            .select(selectFields)
            .from(collectionCardLocation)
            .innerJoin(
              collectionCard,
              eq(collectionCardLocation.collectionCardId, collectionCard.id),
            )
            .where(eq(collectionCard.userId, userId))
            .orderBy(asc(collectionCardLocation.assignedAt), asc(collectionCardLocation.id))
            .limit(batchSize);
        }

        // Transform documents for RxDB (convert dates to timestamps, add _deleted flag)
        const rxdbDocuments = documents.map((doc) => ({
          id: doc.id,
          collectionCardId: doc.collectionCardId,
          storageContainerId: doc.storageContainerId,
          deckId: doc.deckId,
          assignedAt: doc.assignedAt.getTime(),
          _deleted: false,
        }));

        // Calculate new checkpoint (using assignedAt as updatedAt equivalent)
        const lastDoc = rxdbDocuments[rxdbDocuments.length - 1];
        const newCheckpoint: ReplicationCheckpoint = lastDoc
          ? { id: lastDoc.id, updatedAt: lastDoc.assignedAt }
          : checkpoint;

        return {
          documents: rxdbDocuments,
          checkpoint: newCheckpoint,
        };
      }),

    /**
     * Stream endpoint for live collection card location replication.
     * Uses Server-Sent Events (SSE) to push real-time updates to clients.
     *
     * The stream can emit:
     * - Document updates with checkpoint (for individual location changes)
     * - 'RESYNC' signal (after bulk imports to trigger full re-sync)
     *
     * @see https://rxdb.info/replication-http.html#pullstream-for-ongoing-changes
     */
    stream: protectedProcedure
      .output(eventIterator(z.custom<CollectionCardLocationStreamEvent>()))
      .handler(async function* ({ context, signal }) {
        const userId = context.session.user.id;

        // Subscribe to collection card location events for this user
        for await (const event of collectionCardLocationPublisher.subscribe(userId, { signal })) {
          yield event;
        }
      }),
  },
};
