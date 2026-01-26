import { ORPCError } from "@orpc/server";
import { db } from "@mana-vault/db";
import {
  collectionCard,
  scryfallCard,
  virtualList,
  virtualListCard,
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
 * Supported CSV format identifiers for card imports.
 * Add new formats here as parsers are implemented.
 */
const csvFormatSchema = z.enum(["manabox"]);
export type CsvFormat = z.infer<typeof csvFormatSchema>;

export const listsRouter = {
  // List all virtual lists for the current user with card counts
  list: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session.user.id;

    const lists = await db
      .select({
        id: virtualList.id,
        name: virtualList.name,
        description: virtualList.description,
        sourceType: virtualList.sourceType,
        sourceName: virtualList.sourceName,
        snapshotDate: virtualList.snapshotDate,
        createdAt: virtualList.createdAt,
        updatedAt: virtualList.updatedAt,
        cardCount: sql<number>`count(${virtualListCard.id})`.as("card_count"),
      })
      .from(virtualList)
      .leftJoin(virtualListCard, eq(virtualListCard.virtualListId, virtualList.id))
      .where(eq(virtualList.userId, userId))
      .groupBy(virtualList.id)
      .orderBy(asc(virtualList.name));

    return lists;
  }),

  // Get a single list by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      const [list] = await db
        .select({
          id: virtualList.id,
          name: virtualList.name,
          description: virtualList.description,
          sourceType: virtualList.sourceType,
          sourceName: virtualList.sourceName,
          snapshotDate: virtualList.snapshotDate,
          createdAt: virtualList.createdAt,
          updatedAt: virtualList.updatedAt,
          cardCount: sql<number>`count(${virtualListCard.id})`.as("card_count"),
        })
        .from(virtualList)
        .leftJoin(virtualListCard, eq(virtualListCard.virtualListId, virtualList.id))
        .where(and(eq(virtualList.id, input.id), eq(virtualList.userId, userId)))
        .groupBy(virtualList.id);

      if (!list) {
        throw new ORPCError("NOT_FOUND", { message: "List not found" });
      }

      return list;
    }),

  // Create a new virtual list
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        sourceType: z.enum(["gift", "purchase", "trade", "other"]).optional(),
        sourceName: z.string().max(100).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      const [list] = await db
        .insert(virtualList)
        .values({
          userId,
          name: input.name,
          description: input.description ?? null,
          sourceType: input.sourceType ?? null,
          sourceName: input.sourceName ?? null,
        })
        .returning();

      return list;
    }),

  /**
   * Import cards to a list from CSV content.
   * Accepts raw CSV text and the format identifier for parsing.
   */
  importCards: protectedProcedure
    .input(
      z.object({
        /** The ID of the list to import cards into */
        listId: z.string(),
        /** Raw CSV content (either pasted or from file) */
        csvContent: z.string().min(1, "CSV content is required"),
        /** The format of the CSV for selecting the appropriate parser */
        format: csvFormatSchema,
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      // Verify the list exists and belongs to the user
      const [list] = await db
        .select({ id: virtualList.id })
        .from(virtualList)
        .where(and(eq(virtualList.id, input.listId), eq(virtualList.userId, userId)));

      if (!list) {
        throw new ORPCError("NOT_FOUND", { message: "List not found" });
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

      // Create collection cards and virtual list cards for each row
      // Skip rows that fail due to missing Scryfall card (foreign key constraint)
      const createdCollectionCardIds: string[] = [];
      let skippedCount = 0;

      for (const row of parseResult.rows) {
        // Create one collection card per quantity
        for (let i = 0; i < row.quantity; i++) {
          try {
            const [newCollectionCard] = await db
              .insert(collectionCard)
              .values({
                userId,
                scryfallCardId: row.scryfallId,
                condition: mapCondition(row.condition),
                isFoil: row.foil === "foil" || row.foil === "etched",
                language: row.language,
                notes: row.misprint ? "Misprint" : row.altered ? "Altered" : null,
              })
              .returning({ id: collectionCard.id });

            if (newCollectionCard) {
              createdCollectionCardIds.push(newCollectionCard.id);

              // Add to the virtual list
              await db.insert(virtualListCard).values({
                virtualListId: input.listId,
                collectionCardId: newCollectionCard.id,
                notes: row.purchasePrice
                  ? `Purchase price: ${row.purchasePrice} ${row.purchasePriceCurrency || ""}`
                  : null,
              });
            }
          } catch (error) {
            // Skip cards that don't exist in the Scryfall database (foreign key constraint)
            if (isForeignKeyError(error)) {
              skippedCount++;
              // Only log once per unique card, not per quantity
              if (i === 0) {
                console.warn(`Skipping card not found in database: ${row.scryfallId}`);
              }
              break; // Skip remaining quantity for this card
            }
            throw error; // Re-throw unexpected errors
          }
        }
      }

      const totalQuantity = parseResult.rows.reduce((sum, row) => sum + row.quantity, 0);

      return {
        listId: input.listId,
        format: input.format,
        imported: createdCollectionCardIds.length,
        totalQuantity,
        skipped: skippedCount,
        parseErrors: parseResult.errors.length,
        message:
          skippedCount > 0
            ? `Successfully imported ${createdCollectionCardIds.length} cards. ${skippedCount} cards skipped (invalid Scryfall IDs).`
            : `Successfully imported ${createdCollectionCardIds.length} cards`,
      };
    }),

  /**
   * Get cards in a virtual list with their scryfall data
   */
  getCards: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      // Verify the list exists and belongs to the user
      const [list] = await db
        .select({ id: virtualList.id })
        .from(virtualList)
        .where(and(eq(virtualList.id, input.listId), eq(virtualList.userId, userId)));

      if (!list) {
        throw new ORPCError("NOT_FOUND", { message: "List not found" });
      }

      // Get all cards in the list with their collection card and scryfall data
      const cards = await db
        .select({
          id: virtualListCard.id,
          notes: virtualListCard.notes,
          createdAt: virtualListCard.createdAt,
          collectionCard: {
            id: collectionCard.id,
            condition: collectionCard.condition,
            isFoil: collectionCard.isFoil,
            language: collectionCard.language,
            notes: collectionCard.notes,
          },
          scryfallCard: {
            id: scryfallCard.id,
            name: scryfallCard.name,
            setCode: scryfallCard.setCode,
            setName: scryfallCard.setName,
            collectorNumber: scryfallCard.collectorNumber,
            rarity: scryfallCard.rarity,
            imageUri: scryfallCard.imageUri,
            manaCost: scryfallCard.manaCost,
            typeLine: scryfallCard.typeLine,
          },
        })
        .from(virtualListCard)
        .innerJoin(collectionCard, eq(virtualListCard.collectionCardId, collectionCard.id))
        .innerJoin(scryfallCard, eq(collectionCard.scryfallCardId, scryfallCard.id))
        .where(eq(virtualListCard.virtualListId, input.listId))
        .orderBy(asc(scryfallCard.name));

      return cards;
    }),
};
