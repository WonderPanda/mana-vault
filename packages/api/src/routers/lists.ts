import { ORPCError } from "@orpc/server";
import { db } from "@mana-vault/db";
import { scryfallCard, virtualList, virtualListCard } from "@mana-vault/db/schema/app";
import { and, asc, eq, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { mapCondition, parseManaBoxCSV } from "../parsers/manabox";
import { parseMoxfieldText } from "../parsers/moxfield";
import { lookupScryfallCard } from "../utils/scryfall-lookup";

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
 * Add new formats here as parsers are implemented.
 */
const importFormatSchema = z.enum(["manabox", "moxfield"]);
export type ImportFormat = z.infer<typeof importFormatSchema>;

/**
 * List type schema - owned lists contain cards you have, wishlist contains cards you want
 */
const listTypeSchema = z.enum(["owned", "wishlist"]);
export type ListType = z.infer<typeof listTypeSchema>;

export const listsRouter = {
  // List all virtual lists for the current user with card counts
  list: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session.user.id;

    const lists = await db
      .select({
        id: virtualList.id,
        name: virtualList.name,
        description: virtualList.description,
        listType: virtualList.listType,
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
          listType: virtualList.listType,
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
        listType: listTypeSchema.default("owned"),
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
          listType: input.listType,
          sourceType: input.sourceType ?? null,
          sourceName: input.sourceName ?? null,
        })
        .returning();

      return list;
    }),

  /**
   * Import cards to a list from CSV/text content.
   * Cards are always imported as scryfall references - they can later be
   * "moved to collection" to create actual collection card entries.
   */
  importCards: protectedProcedure
    .input(
      z.object({
        /** The ID of the list to import cards into */
        listId: z.string(),
        /** Raw content (either pasted or from file) */
        csvContent: z.string().min(1, "Content is required"),
        /** The format for selecting the appropriate parser */
        format: importFormatSchema,
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

      let importedCount = 0;
      let skippedCount = 0;
      let parseErrorCount = 0;
      let totalQuantity = 0;

      if (input.format === "manabox") {
        // Parse the CSV based on ManaBox format
        const parseResult = parseManaBoxCSV(input.csvContent);
        parseErrorCount = parseResult.errors.length;

        if (parseResult.rows.length === 0) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              parseResult.errors.length > 0
                ? `Failed to parse CSV: ${parseResult.errors[0]?.error}`
                : "No valid rows found in CSV",
          });
        }

        totalQuantity = parseResult.rows.reduce((sum, row) => sum + row.quantity, 0);

        // Import all cards as scryfall references (no collection cards created)
        for (const row of parseResult.rows) {
          try {
            await db.insert(virtualListCard).values({
              virtualListId: input.listId,
              scryfallCardId: row.scryfallId,
              quantity: row.quantity,
              condition: mapCondition(row.condition),
              isFoil: row.foil === "foil" || row.foil === "etched",
              language: row.language,
              snapshotPrice: row.purchasePrice || null,
              notes: row.purchasePrice
                ? `Price: ${row.purchasePrice} ${row.purchasePriceCurrency || ""}`
                : null,
            });
            importedCount += row.quantity;
          } catch (error) {
            // Skip cards that don't exist in the Scryfall database (foreign key constraint)
            if (isForeignKeyError(error)) {
              skippedCount++;
              console.warn(`Skipping card not found in database: ${row.scryfallId}`);
            } else {
              throw error;
            }
          }
        }
      } else if (input.format === "moxfield") {
        // Parse the text based on Moxfield format
        const parseResult = parseMoxfieldText(input.csvContent);
        parseErrorCount = parseResult.errors.length;

        if (parseResult.rows.length === 0) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              parseResult.errors.length > 0
                ? `Failed to parse: ${parseResult.errors[0]?.error}`
                : "No valid rows found",
          });
        }

        totalQuantity = parseResult.stats.totalQuantity;

        // For Moxfield, we need to look up cards by set code + collector number
        for (const row of parseResult.rows) {
          const foundCard = await lookupScryfallCard(row);

          if (!foundCard) {
            skippedCount++;
            console.warn(
              `Card not found in database: ${row.name} (${row.setCode}) ${row.collectorNumber}`,
            );
            continue;
          }

          try {
            await db.insert(virtualListCard).values({
              virtualListId: input.listId,
              scryfallCardId: foundCard.id,
              quantity: row.quantity,
              condition: "NM", // Default condition for Moxfield imports
              isFoil: row.isFoil,
              language: "en", // Default language
            });
            importedCount += row.quantity;
          } catch (error) {
            if (isForeignKeyError(error)) {
              skippedCount++;
              console.warn(`Skipping card with FK error: ${foundCard.id}`);
            } else {
              throw error;
            }
          }
        }
      }

      return {
        listId: input.listId,
        format: input.format,
        imported: importedCount,
        totalQuantity,
        skipped: skippedCount,
        parseErrors: parseErrorCount,
        message:
          skippedCount > 0
            ? `Successfully imported ${importedCount} cards. ${skippedCount} cards skipped (not found in database).`
            : `Successfully imported ${importedCount} cards`,
      };
    }),

  /**
   * Get cards in a virtual list with their scryfall data.
   * Cards may optionally be linked to collection cards (if moved to collection).
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

      // Get all cards in the list with scryfall data
      // Use left join for collection card (may or may not be linked)
      const cards = await db
        .select({
          id: virtualListCard.id,
          notes: virtualListCard.notes,
          quantity: virtualListCard.quantity,
          condition: virtualListCard.condition,
          isFoil: virtualListCard.isFoil,
          language: virtualListCard.language,
          createdAt: virtualListCard.createdAt,
          // Collection card link (null if not yet moved to collection)
          collectionCardId: virtualListCard.collectionCardId,
          // Scryfall data from direct reference
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
        .innerJoin(scryfallCard, eq(virtualListCard.scryfallCardId, scryfallCard.id))
        .where(eq(virtualListCard.virtualListId, input.listId))
        .orderBy(asc(scryfallCard.name));

      return cards.map((card) => ({
        id: card.id,
        notes: card.notes,
        quantity: card.quantity,
        condition: card.condition,
        isFoil: card.isFoil,
        language: card.language,
        createdAt: card.createdAt,
        isInCollection: card.collectionCardId != null,
        scryfallCard: {
          id: card.scryfallCard.id,
          name: card.scryfallCard.name,
          setCode: card.scryfallCard.setCode,
          setName: card.scryfallCard.setName,
          collectorNumber: card.scryfallCard.collectorNumber,
          rarity: card.scryfallCard.rarity,
          imageUri: card.scryfallCard.imageUri,
          manaCost: card.scryfallCard.manaCost,
          typeLine: card.scryfallCard.typeLine,
        },
      }));
    }),

  /**
   * Delete a list and its card references.
   * This only removes the list and virtualListCard entries - collection cards are never affected.
   * Lists are snapshots/references, not the source of truth for owned cards.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      // Verify the list exists and belongs to the user
      const [list] = await db
        .select({ id: virtualList.id, name: virtualList.name })
        .from(virtualList)
        .where(and(eq(virtualList.id, input.id), eq(virtualList.userId, userId)));

      if (!list) {
        throw new ORPCError("NOT_FOUND", { message: "List not found" });
      }

      // Delete the list (cascades to virtualListCard entries via foreign key)
      await db.delete(virtualList).where(eq(virtualList.id, input.id));

      return { success: true, deletedListName: list.name };
    }),
};
