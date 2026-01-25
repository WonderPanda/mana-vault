import { ORPCError } from "@orpc/server";
import { db } from "@mana-vault/db";
import {
  collectionCard,
  scryfallCard,
  virtualList,
  virtualListCard,
} from "@mana-vault/db/schema/app";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { fetchScryfallCards, getCardImageUri } from "../lib/scryfall";
import { mapCondition, parseManaBoxCSV } from "../parsers/manabox";

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

      // Get unique Scryfall IDs from parsed rows
      const scryfallIds = [...new Set(parseResult.rows.map((row) => row.scryfallId))];

      // Check which cards already exist in the database (and if they have images)
      const existingCards = await db
        .select({ id: scryfallCard.id, imageUri: scryfallCard.imageUri })
        .from(scryfallCard)
        .where(inArray(scryfallCard.id, scryfallIds));

      const existingCardIds = new Set(existingCards.map((c) => c.id));
      const cardsWithoutImages = new Set(
        existingCards.filter((c) => !c.imageUri).map((c) => c.id),
      );

      // Find cards that need to be fetched from Scryfall (missing OR missing images)
      const missingIds = scryfallIds.filter((id) => !existingCardIds.has(id));
      const idsNeedingUpdate = scryfallIds.filter(
        (id) => existingCardIds.has(id) && cardsWithoutImages.has(id),
      );
      const idsToFetch = [...new Set([...missingIds, ...idsNeedingUpdate])];

      // Track which card IDs we have in the database (existing + newly fetched)
      const availableCardIds = new Set(existingCardIds);

      // Fetch missing cards and cards needing image updates from Scryfall API in parallel
      if (idsToFetch.length > 0) {
        const scryfallData = await fetchScryfallCards(idsToFetch);

        // Insert or update fetched cards in database
        for (const [_id, cardData] of scryfallData) {
          const cardValues = {
            id: cardData.id,
            oracleId: cardData.oracle_id,
            name: cardData.name,
            setCode: cardData.set,
            setName: cardData.set_name,
            collectorNumber: cardData.collector_number,
            rarity: cardData.rarity,
            manaCost: cardData.mana_cost ?? null,
            cmc: cardData.cmc ?? null,
            typeLine: cardData.type_line ?? null,
            oracleText: cardData.oracle_text ?? null,
            colors: cardData.colors ? JSON.stringify(cardData.colors) : null,
            colorIdentity: cardData.color_identity
              ? JSON.stringify(cardData.color_identity)
              : null,
            imageUri: getCardImageUri(cardData),
            scryfallUri: cardData.scryfall_uri ?? null,
          };

          if (cardsWithoutImages.has(cardData.id)) {
            // Update existing card with full data
            await db
              .update(scryfallCard)
              .set(cardValues)
              .where(eq(scryfallCard.id, cardData.id));
          } else {
            // Insert new card
            await db.insert(scryfallCard).values(cardValues).onConflictDoNothing();
          }

          // Mark this card as available
          availableCardIds.add(cardData.id);
        }

        // Track cards that couldn't be fetched (only count truly missing ones, not updates)
        const fetchedIds = new Set(scryfallData.keys());
        const unfetchedIds = missingIds.filter((id) => !fetchedIds.has(id));

        if (unfetchedIds.length > 0) {
          console.warn(`Could not fetch ${unfetchedIds.length} cards from Scryfall:`, unfetchedIds);
        }
      }

      // Filter to only rows with cards we actually have in the database
      const validRows = parseResult.rows.filter((row) => availableCardIds.has(row.scryfallId));
      const skippedCount = parseResult.rows.length - validRows.length;

      if (validRows.length === 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: `None of the ${parseResult.rows.length} cards could be found or fetched from Scryfall. Please check the Scryfall IDs are valid.`,
        });
      }

      // Create collection cards and virtual list cards for each valid row
      // We need to handle quantity by creating multiple collection cards
      const createdCollectionCardIds: string[] = [];

      for (const row of validRows) {
        // Create one collection card per quantity
        for (let i = 0; i < row.quantity; i++) {
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
        }
      }

      const totalQuantity = validRows.reduce((sum, row) => sum + row.quantity, 0);

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
