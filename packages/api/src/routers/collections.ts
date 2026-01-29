import { randomUUID } from "node:crypto";
import { ORPCError, eventIterator } from "@orpc/server";
import { db } from "@mana-vault/db";
import {
  storageContainer,
  collectionCard,
  collectionCardLocation,
  scryfallCard,
} from "@mana-vault/db/schema/app";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { mapCondition, parseManaBoxCSV } from "../parsers/manabox";
import { ensureScryfallCard } from "../utils/scryfall-fetch";
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
   * Add cards from Scryfall search to a collection.
   * Creates collection_card + collection_card_location entries.
   *
   * Per SCHEMA.md: Each row = one physical card (no quantity field).
   * So we create one collection_card entry per unit of quantity.
   */
  addCardsFromSearch: protectedProcedure
    .input(
      z.object({
        /** The storage container (collection) to add cards to */
        collectionId: z.string(),
        /** Cards to add with their Scryfall IDs and quantities */
        cards: z
          .array(
            z.object({
              scryfallId: z.string(),
              quantity: z.number().int().positive().default(1),
            }),
          )
          .min(1, "At least one card is required"),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      // Verify the collection exists and belongs to the user
      const collection = await db.query.storageContainer.findFirst({
        where: and(
          eq(storageContainer.id, input.collectionId),
          eq(storageContainer.userId, userId),
        ),
      });

      if (!collection) {
        throw new ORPCError("NOT_FOUND", { message: "Collection not found" });
      }

      let addedCount = 0;
      let skippedCount = 0;
      let totalQuantity = 0;

      for (const cardInput of input.cards) {
        const card = await ensureScryfallCard(cardInput.scryfallId);

        if (!card) {
          skippedCount++;
          console.warn(`Card not found in Scryfall: ${cardInput.scryfallId}`);
          continue;
        }

        try {
          // Create one collection_card + location per unit of quantity
          for (let i = 0; i < cardInput.quantity; i++) {
            const cardId = randomUUID();

            await db.insert(collectionCard).values({
              id: cardId,
              userId,
              scryfallCardId: card.id,
              condition: "near_mint",
              isFoil: false,
              language: "en",
              notes: null,
              acquiredAt: new Date(),
              status: "owned",
            });

            await db.insert(collectionCardLocation).values({
              id: randomUUID(),
              collectionCardId: cardId,
              storageContainerId: input.collectionId,
            });
          }

          // Touch the scryfall card's updated_at to trigger replication sync
          await db
            .update(scryfallCard)
            .set({ updatedAt: new Date() })
            .where(eq(scryfallCard.id, card.id));

          addedCount++;
          totalQuantity += cardInput.quantity;
        } catch (error) {
          if (isForeignKeyError(error)) {
            skippedCount++;
            console.warn(`Skipping card with FK error: ${card.id}`);
          } else {
            throw error;
          }
        }
      }

      if (addedCount > 0) {
        collectionCardPublisher.publish(userId, "RESYNC");
        collectionCardLocationPublisher.publish(userId, "RESYNC");
      }

      return {
        collectionId: input.collectionId,
        added: addedCount,
        totalQuantity,
        skipped: skippedCount,
        message:
          skippedCount > 0
            ? `Added ${totalQuantity} card${totalQuantity !== 1 ? "s" : ""}. ${skippedCount} card${skippedCount !== 1 ? "s" : ""} could not be found.`
            : `Added ${totalQuantity} card${totalQuantity !== 1 ? "s" : ""} to the collection.`,
      };
    }),

  /**
   * Import cards to the collection from CSV content.
   * Creates actual collection_card entries (source of truth for owned cards).
   * Optionally assigns them to a storage container.
   *
   * Uses json_each + json_extract to insert many rows with only 1 SQL variable,
   * avoiding D1's 100 variable limit. Pre-generates UUIDs so we can insert
   * both cards and locations without waiting for returned IDs.
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

      // Build list of all cards to insert (expanding quantities)
      // Per SCHEMA.md: Each row = one physical card (no quantity field)
      // So we create one collection_card entry per quantity
      // Pre-generate UUIDs so we can insert locations without waiting for returned IDs
      interface CardInsertData {
        id: string;
        userId: string;
        scryfallCardId: string;
        condition: string;
        isFoil: boolean;
        language: string;
        notes: string | null;
        acquiredAt: number; // timestamp_ms
        status: string;
      }

      const cardsToInsert: CardInsertData[] = [];

      for (const row of parseResult.rows) {
        for (let i = 0; i < row.quantity; i++) {
          cardsToInsert.push({
            id: randomUUID(),
            userId,
            scryfallCardId: row.scryfallId,
            condition: mapCondition(row.condition),
            isFoil: row.foil === "foil" || row.foil === "etched",
            language: row.language,
            notes: row.purchasePrice
              ? `Imported from ManaBox. Price: ${row.purchasePrice} ${row.purchasePriceCurrency || ""}`
              : "Imported from ManaBox",
            acquiredAt: Date.now(),
            status: "owned",
          });
        }
      }

      const totalQuantity = cardsToInsert.length;

      if (totalQuantity === 0) {
        return {
          collectionId: input.collectionId ?? null,
          format: input.format,
          imported: 0,
          totalQuantity: 0,
          skipped: 0,
          parseErrors: parseResult.errors.length,
          message: "No cards to import",
        };
      }

      // Use json_each to insert many rows with only 1 SQL variable
      // This avoids D1's 100 variable limit
      // Process in chunks to avoid memory issues and stay within request limits
      const CHUNK_SIZE = 100;
      let importedCount = 0;

      for (let chunkStart = 0; chunkStart < cardsToInsert.length; chunkStart += CHUNK_SIZE) {
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, cardsToInsert.length);
        const cardChunk = cardsToInsert.slice(chunkStart, chunkEnd);
        const cardJsonData = JSON.stringify(cardChunk);

        // Insert collection cards using json_each (1 variable regardless of chunk size)
        // Use INSERT OR IGNORE to skip cards with invalid scryfallCardId (FK constraint)
        await db.run(sql`
          INSERT OR IGNORE INTO ${collectionCard} (
            id,
            user_id,
            scryfall_card_id,
            condition,
            is_foil,
            language,
            notes,
            acquired_at,
            status,
            created_at,
            updated_at
          )
          SELECT
            json_extract(value, '$.id'),
            json_extract(value, '$.userId'),
            json_extract(value, '$.scryfallCardId'),
            json_extract(value, '$.condition'),
            json_extract(value, '$.isFoil'),
            json_extract(value, '$.language'),
            json_extract(value, '$.notes'),
            json_extract(value, '$.acquiredAt'),
            json_extract(value, '$.status'),
            cast(unixepoch('subsecond') * 1000 as integer),
            cast(unixepoch('subsecond') * 1000 as integer)
          FROM json_each(${cardJsonData})
        `);

        // If a collection ID is provided, insert location entries for successfully inserted cards
        // We need to join with the inserted cards to only create locations for cards that exist
        if (input.collectionId) {
          // Build location data with pre-generated IDs
          const locationData = cardChunk.map((card) => ({
            id: randomUUID(),
            collectionCardId: card.id,
            storageContainerId: input.collectionId,
          }));
          const locationJsonData = JSON.stringify(locationData);

          // Insert locations only for cards that were successfully inserted
          // The INNER JOIN ensures we only insert locations for existing collection cards
          await db.run(sql`
            INSERT OR IGNORE INTO ${collectionCardLocation} (
              id,
              collection_card_id,
              storage_container_id,
              assigned_at,
              updated_at
            )
            SELECT
              json_extract(loc.value, '$.id'),
              json_extract(loc.value, '$.collectionCardId'),
              json_extract(loc.value, '$.storageContainerId'),
              cast(unixepoch('subsecond') * 1000 as integer),
              cast(unixepoch('subsecond') * 1000 as integer)
            FROM json_each(${locationJsonData}) AS loc
            INNER JOIN ${collectionCard} AS cc
              ON cc.id = json_extract(loc.value, '$.collectionCardId')
          `);
        }

        importedCount += cardChunk.length;
      }

      // Note: With INSERT OR IGNORE, we can't easily track how many rows were
      // actually inserted vs skipped due to FK constraints. The importedCount
      // represents the number of cards we attempted to import.

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
        skipped: 0, // Can't track with INSERT OR IGNORE
        parseErrors: parseResult.errors.length,
        message: `Successfully imported ${importedCount} cards`,
      };
    }),

  /**
   * Delete a collection (storage container).
   * This soft-deletes the storage container and marks associated card locations as deleted.
   * Collection cards themselves are NOT deleted - they just become unassigned.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      // Verify the collection exists and belongs to the user
      const [collection] = await db
        .select({
          id: storageContainer.id,
          name: storageContainer.name,
          type: storageContainer.type,
          description: storageContainer.description,
          sortOrder: storageContainer.sortOrder,
          createdAt: storageContainer.createdAt,
        })
        .from(storageContainer)
        .where(
          and(
            eq(storageContainer.id, input.id),
            eq(storageContainer.userId, userId),
            // Only allow deleting non-deleted containers
            sql`${storageContainer.deletedAt} IS NULL`,
          ),
        );

      if (!collection) {
        throw new ORPCError("NOT_FOUND", { message: "Collection not found" });
      }

      const now = new Date();
      const nowMs = now.getTime();

      // Soft delete the storage container
      await db
        .update(storageContainer)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(storageContainer.id, input.id));

      // Find and soft-delete all card locations that reference this storage container
      const affectedLocations = await db
        .select({
          id: collectionCardLocation.id,
          collectionCardId: collectionCardLocation.collectionCardId,
          deckId: collectionCardLocation.deckId,
          assignedAt: collectionCardLocation.assignedAt,
        })
        .from(collectionCardLocation)
        .where(eq(collectionCardLocation.storageContainerId, input.id));

      if (affectedLocations.length > 0) {
        // Soft-delete all affected card locations
        await db
          .update(collectionCardLocation)
          .set({
            deletedAt: now,
            updatedAt: now,
            storageContainerId: null, // Also null out the reference
          })
          .where(eq(collectionCardLocation.storageContainerId, input.id));

        // Publish deletion events for all affected card locations
        const locationDocs = affectedLocations.map((loc) => ({
          id: loc.id,
          collectionCardId: loc.collectionCardId,
          storageContainerId: null,
          deckId: loc.deckId,
          assignedAt: loc.assignedAt.getTime(),
          updatedAt: nowMs,
          _deleted: true,
        }));

        // Publish in batches if needed (using the last location for checkpoint)
        const lastLoc = locationDocs[locationDocs.length - 1];
        if (lastLoc) {
          collectionCardLocationPublisher.publish(userId, {
            documents: locationDocs,
            checkpoint: {
              id: lastLoc.id,
              updatedAt: nowMs,
            },
          });
        }
      }

      // Publish deletion event for the storage container
      storageContainerPublisher.publish(userId, {
        documents: [
          {
            id: input.id,
            userId,
            name: collection.name,
            type: collection.type,
            description: collection.description,
            sortOrder: collection.sortOrder,
            createdAt: collection.createdAt.getTime(),
            updatedAt: nowMs,
            _deleted: true,
          },
        ],
        checkpoint: {
          id: input.id,
          updatedAt: nowMs,
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
     * Returns all storage containers owned by the user, including soft-deleted ones.
     * Soft-deleted containers are returned with _deleted: true so clients can remove them.
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
          // Get documents after the checkpoint (includes soft-deleted)
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
              deletedAt: storageContainer.deletedAt,
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
          // Initial sync - get all documents (includes soft-deleted)
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
              deletedAt: storageContainer.deletedAt,
            })
            .from(storageContainer)
            .where(userCondition)
            .orderBy(asc(storageContainer.updatedAt), asc(storageContainer.id))
            .limit(batchSize);
        }

        // Transform documents for RxDB (convert dates to timestamps, set _deleted based on deletedAt)
        const rxdbDocuments = documents.map((doc) => ({
          id: doc.id,
          userId: doc.userId,
          name: doc.name,
          type: doc.type,
          description: doc.description,
          sortOrder: doc.sortOrder,
          createdAt: doc.createdAt.getTime(),
          updatedAt: doc.updatedAt.getTime(),
          _deleted: doc.deletedAt !== null,
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
     * Returns all collection cards owned by the user, including soft-deleted ones.
     * Soft-deleted cards are returned with _deleted: true so clients can remove them.
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
          deletedAt: collectionCard.deletedAt,
        };

        let documents;
        if (checkpoint) {
          // Get documents after the checkpoint (includes soft-deleted)
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
          // Initial sync - get all collection cards for user (includes soft-deleted)
          documents = await db
            .select(selectFields)
            .from(collectionCard)
            .where(eq(collectionCard.userId, userId))
            .orderBy(asc(collectionCard.updatedAt), asc(collectionCard.id))
            .limit(batchSize);
        }

        // Transform documents for RxDB (convert dates to timestamps, set _deleted based on deletedAt)
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
          _deleted: doc.deletedAt !== null,
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
     * Returns all card locations for the user's collection cards, including soft-deleted ones.
     * Soft-deleted locations are returned with _deleted: true so clients can remove them.
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

        // Use COALESCE to fall back to assignedAt if updatedAt is null (for existing records)
        // This returns an integer (timestamp_ms) so we need to compare with raw numbers
        const effectiveUpdatedAt = sql<number>`COALESCE(${collectionCardLocation.updatedAt}, ${collectionCardLocation.assignedAt})`;

        // Base select fields for collection card locations
        const selectFields = {
          id: collectionCardLocation.id,
          collectionCardId: collectionCardLocation.collectionCardId,
          storageContainerId: collectionCardLocation.storageContainerId,
          deckId: collectionCardLocation.deckId,
          assignedAt: collectionCardLocation.assignedAt,
          updatedAt: effectiveUpdatedAt,
          deletedAt: collectionCardLocation.deletedAt,
        };

        let documents;
        if (checkpoint) {
          // Get documents after the checkpoint (includes soft-deleted)
          // Join with collection_card to filter by user
          // Compare using raw timestamp number since COALESCE returns integer
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
                  sql`${effectiveUpdatedAt} > ${checkpoint.updatedAt}`,
                  and(
                    sql`${effectiveUpdatedAt} = ${checkpoint.updatedAt}`,
                    gt(collectionCardLocation.id, checkpoint.id),
                  ),
                ),
              ),
            )
            .orderBy(asc(effectiveUpdatedAt), asc(collectionCardLocation.id))
            .limit(batchSize);
        } else {
          // Initial sync - get all locations for user's collection cards (includes soft-deleted)
          documents = await db
            .select(selectFields)
            .from(collectionCardLocation)
            .innerJoin(
              collectionCard,
              eq(collectionCardLocation.collectionCardId, collectionCard.id),
            )
            .where(eq(collectionCard.userId, userId))
            .orderBy(asc(effectiveUpdatedAt), asc(collectionCardLocation.id))
            .limit(batchSize);
        }

        // Transform documents for RxDB (convert dates to timestamps, set _deleted based on deletedAt)
        // Note: updatedAt from COALESCE query comes back as number (ms) directly
        const rxdbDocuments = documents.map((doc) => ({
          id: doc.id,
          collectionCardId: doc.collectionCardId,
          storageContainerId: doc.storageContainerId,
          deckId: doc.deckId,
          assignedAt: doc.assignedAt.getTime(),
          updatedAt: doc.updatedAt,
          _deleted: doc.deletedAt !== null,
        }));

        // Calculate new checkpoint using updatedAt
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

function isForeignKeyError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("FOREIGN KEY constraint failed");
}
