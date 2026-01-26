import { ORPCError } from "@orpc/server";
import { db } from "@mana-vault/db";
import { deck, deckCard, scryfallCard } from "@mana-vault/db/schema/app";
import { and, asc, eq, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { parseManaBoxCSV } from "../parsers/manabox";
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
 */
const importFormatSchema = z.enum(["manabox", "moxfield"]);

/**
 * Deck format options
 */
const deckFormatSchema = z.enum([
  "commander",
  "standard",
  "modern",
  "legacy",
  "pioneer",
  "pauper",
  "other",
]);
export type DeckFormat = z.infer<typeof deckFormatSchema>;

/**
 * Deck status options
 */
const deckStatusSchema = z.enum(["active", "retired", "in_progress", "theorycraft"]);
export type DeckStatus = z.infer<typeof deckStatusSchema>;

/**
 * Deck archetype options
 */
const deckArchetypeSchema = z.enum(["aggro", "control", "combo", "midrange", "tempo", "other"]);
export type DeckArchetype = z.infer<typeof deckArchetypeSchema>;

export const decksRouter = {
  /**
   * List all decks for the current user with card counts
   */
  list: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session.user.id;

    const decks = await db
      .select({
        id: deck.id,
        name: deck.name,
        format: deck.format,
        status: deck.status,
        archetype: deck.archetype,
        colorIdentity: deck.colorIdentity,
        description: deck.description,
        isPublic: deck.isPublic,
        sortOrder: deck.sortOrder,
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt,
        cardCount: sql<number>`coalesce(sum(${deckCard.quantity}), 0)`.as("card_count"),
      })
      .from(deck)
      .leftJoin(deckCard, eq(deckCard.deckId, deck.id))
      .where(eq(deck.userId, userId))
      .groupBy(deck.id)
      .orderBy(asc(deck.name));

    return decks;
  }),

  /**
   * Get a single deck by ID
   */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      const [deckData] = await db
        .select({
          id: deck.id,
          name: deck.name,
          format: deck.format,
          status: deck.status,
          archetype: deck.archetype,
          colorIdentity: deck.colorIdentity,
          description: deck.description,
          isPublic: deck.isPublic,
          sortOrder: deck.sortOrder,
          createdAt: deck.createdAt,
          updatedAt: deck.updatedAt,
          cardCount: sql<number>`coalesce(sum(${deckCard.quantity}), 0)`.as("card_count"),
        })
        .from(deck)
        .leftJoin(deckCard, eq(deckCard.deckId, deck.id))
        .where(and(eq(deck.id, input.id), eq(deck.userId, userId)))
        .groupBy(deck.id);

      if (!deckData) {
        throw new ORPCError("NOT_FOUND", { message: "Deck not found" });
      }

      return deckData;
    }),

  /**
   * Create a new deck
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        format: deckFormatSchema.default("commander"),
        status: deckStatusSchema.default("in_progress"),
        archetype: deckArchetypeSchema.optional(),
        colorIdentity: z.string().optional(), // JSON array of colors
        description: z.string().max(2000).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      const [newDeck] = await db
        .insert(deck)
        .values({
          userId,
          name: input.name,
          format: input.format,
          status: input.status,
          archetype: input.archetype ?? null,
          colorIdentity: input.colorIdentity ?? null,
          description: input.description ?? null,
        })
        .returning();

      return newDeck;
    }),

  /**
   * Import cards to a deck from CSV content.
   * Cards are imported as deck_card entries with oracle_id references.
   */
  importCards: protectedProcedure
    .input(
      z.object({
        /** The ID of the deck to import cards into */
        deckId: z.string(),
        /** Raw CSV content (either pasted or from file) */
        csvContent: z.string().min(1, "CSV content is required"),
        /** The format of the CSV for selecting the appropriate parser */
        format: importFormatSchema,
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      // Verify the deck exists and belongs to the user
      const [existingDeck] = await db
        .select({ id: deck.id })
        .from(deck)
        .where(and(eq(deck.id, input.deckId), eq(deck.userId, userId)));

      if (!existingDeck) {
        throw new ORPCError("NOT_FOUND", { message: "Deck not found" });
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

        // Import cards - we need to look up the oracle_id from the scryfall card
        for (const row of parseResult.rows) {
          try {
            // Look up the scryfall card to get the oracle_id
            const [card] = await db
              .select({
                id: scryfallCard.id,
                oracleId: scryfallCard.oracleId,
              })
              .from(scryfallCard)
              .where(eq(scryfallCard.id, row.scryfallId));

            if (!card) {
              skippedCount++;
              console.warn(`Skipping card not found in database: ${row.scryfallId}`);
              continue;
            }

            await db.insert(deckCard).values({
              deckId: input.deckId,
              oracleId: card.oracleId,
              preferredScryfallId: row.scryfallId,
              quantity: row.quantity,
              board: "main",
              isCommander: false,
              isCompanion: false,
              isProxy: false,
            });

            importedCount += row.quantity;
          } catch (error) {
            if (isForeignKeyError(error)) {
              skippedCount++;
              console.warn(`Skipping card with FK error: ${row.scryfallId}`);
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
            await db.insert(deckCard).values({
              deckId: input.deckId,
              oracleId: foundCard.oracleId,
              preferredScryfallId: foundCard.id,
              quantity: row.quantity,
              board: "main",
              isCommander: false,
              isCompanion: false,
              isProxy: false,
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
        deckId: input.deckId,
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
   * Get cards in a deck with their scryfall data.
   */
  getCards: protectedProcedure
    .input(z.object({ deckId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      // Verify the deck exists and belongs to the user
      const [existingDeck] = await db
        .select({ id: deck.id })
        .from(deck)
        .where(and(eq(deck.id, input.deckId), eq(deck.userId, userId)));

      if (!existingDeck) {
        throw new ORPCError("NOT_FOUND", { message: "Deck not found" });
      }

      // Get all cards in the deck with scryfall data from preferred printing
      const cards = await db
        .select({
          id: deckCard.id,
          oracleId: deckCard.oracleId,
          quantity: deckCard.quantity,
          board: deckCard.board,
          isCommander: deckCard.isCommander,
          isCompanion: deckCard.isCompanion,
          isProxy: deckCard.isProxy,
          sortOrder: deckCard.sortOrder,
          createdAt: deckCard.createdAt,
          collectionCardId: deckCard.collectionCardId,
          // Scryfall data from preferred printing
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
        .from(deckCard)
        .innerJoin(scryfallCard, eq(deckCard.preferredScryfallId, scryfallCard.id))
        .where(eq(deckCard.deckId, input.deckId))
        .orderBy(asc(scryfallCard.name));

      return cards.map((card) => ({
        id: card.id,
        oracleId: card.oracleId,
        quantity: card.quantity,
        board: card.board,
        isCommander: card.isCommander,
        isCompanion: card.isCompanion,
        isProxy: card.isProxy,
        sortOrder: card.sortOrder,
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
   * Delete a deck and all its cards.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      // Verify the deck exists and belongs to the user
      const [existingDeck] = await db
        .select({ id: deck.id, name: deck.name })
        .from(deck)
        .where(and(eq(deck.id, input.id), eq(deck.userId, userId)));

      if (!existingDeck) {
        throw new ORPCError("NOT_FOUND", { message: "Deck not found" });
      }

      // Delete the deck (cascades to deck_card entries via foreign key)
      await db.delete(deck).where(eq(deck.id, input.id));

      return { success: true, deletedDeckName: existingDeck.name };
    }),
};
