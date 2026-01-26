import { ORPCError } from "@orpc/server";
import { db } from "@mana-vault/db";
import {
  storageContainer,
  collectionCard,
  collectionCardLocation,
} from "@mana-vault/db/schema/app";
import { and, asc, eq, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { mapCondition, parseManaBoxCSV } from "../parsers/manabox";

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

      return { success: true, deletedCollectionName: collection.name };
    }),
};
