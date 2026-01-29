import { ORPCError } from "@orpc/server";
import { db } from "@mana-vault/db";
import { scryfallCard, virtualList, virtualListCard } from "@mana-vault/db/schema/app";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import { mapCondition, parseManaBoxCSV } from "../parsers/manabox";
import { parseMoxfieldText } from "../parsers/moxfield";
import { ensureScryfallCard } from "../utils/scryfall-fetch";
import { lookupScryfallCard } from "../utils/scryfall-lookup";

/**
 * Generate a URL-friendly slug from a string
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars (except spaces and hyphens)
    .replace(/[\s_-]+/g, "-") // Replace spaces, underscores, and multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ""); // Remove leading and trailing hyphens
}

/**
 * Generate a unique slug for a list
 */
async function generateUniqueSlug(name: string, userId: string): Promise<string> {
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;

  // Check if slug exists for this user
  while (true) {
    const [existing] = await db
      .select({ id: virtualList.id })
      .from(virtualList)
      .where(and(eq(virtualList.userId, userId), eq(virtualList.slug, slug)))
      .limit(1);

    if (!existing) {
      return slug;
    }

    // Append counter if slug exists
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

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
          userId: virtualList.userId,
          name: virtualList.name,
          description: virtualList.description,
          listType: virtualList.listType,
          sourceType: virtualList.sourceType,
          sourceName: virtualList.sourceName,
          snapshotDate: virtualList.snapshotDate,
          isPublic: virtualList.isPublic,
          slug: virtualList.slug,
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

      // Generate a unique slug from the list name
      const slug = await generateUniqueSlug(input.name, userId);

      const [list] = await db
        .insert(virtualList)
        .values({
          userId,
          name: input.name,
          description: input.description ?? null,
          listType: input.listType,
          sourceType: input.sourceType ?? null,
          sourceName: input.sourceName ?? null,
          slug,
        })
        .returning();

      return list;
    }),

  // Update a virtual list (name, description, isPublic, slug)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional().nullable(),
        isPublic: z.boolean().optional(),
        slug: z.string().min(1).max(100).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      // Verify the list exists and belongs to the user
      const [existingList] = await db
        .select({ id: virtualList.id, name: virtualList.name, slug: virtualList.slug })
        .from(virtualList)
        .where(and(eq(virtualList.id, input.id), eq(virtualList.userId, userId)));

      if (!existingList) {
        throw new ORPCError("NOT_FOUND", { message: "List not found" });
      }

      // If making the list public and it doesn't have a slug, generate one
      let slugToUse = input.slug;
      if (input.isPublic === true && !existingList.slug && !input.slug) {
        slugToUse = await generateUniqueSlug(existingList.name, userId);
      }

      // If updating slug, ensure it's unique for this user
      if (slugToUse && slugToUse !== existingList.slug) {
        const [slugConflict] = await db
          .select({ id: virtualList.id })
          .from(virtualList)
          .where(and(eq(virtualList.userId, userId), eq(virtualList.slug, slugToUse)))
          .limit(1);

        if (slugConflict) {
          throw new ORPCError("CONFLICT", { message: "This slug is already in use" });
        }
      }

      const [updatedList] = await db
        .update(virtualList)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
          ...(slugToUse !== undefined && { slug: slugToUse }),
        })
        .where(eq(virtualList.id, input.id))
        .returning();

      return updatedList;
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
            priceUsd: scryfallCard.priceUsd,
            priceUsdFoil: scryfallCard.priceUsdFoil,
          },
        })
        .from(virtualListCard)
        .innerJoin(scryfallCard, eq(virtualListCard.scryfallCardId, scryfallCard.id))
        .where(eq(virtualListCard.virtualListId, input.listId))
        .orderBy(
          desc(sql`CASE WHEN ${virtualListCard.isFoil} = 1 THEN ${scryfallCard.priceUsdFoil} ELSE ${scryfallCard.priceUsd} END`),
          asc(scryfallCard.name),
        );

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
          priceUsd: card.scryfallCard.priceUsd,
          priceUsdFoil: card.scryfallCard.priceUsdFoil,
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

  /**
   * Add cards from Scryfall search to a list.
   * This creates virtual_list_card entries with scryfall references.
   *
   * Per SCHEMA.md: Adding to a list does NOT create collection cards.
   * Lists are staging areas that reference Scryfall cards directly.
   */
  addCardsFromSearch: protectedProcedure
    .input(
      z.object({
        /** The ID of the list to add cards to */
        listId: z.string(),
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

      // Verify the list exists and belongs to the user
      const [list] = await db
        .select({ id: virtualList.id })
        .from(virtualList)
        .where(and(eq(virtualList.id, input.listId), eq(virtualList.userId, userId)));

      if (!list) {
        throw new ORPCError("NOT_FOUND", { message: "List not found" });
      }

      let addedCount = 0;
      let skippedCount = 0;
      let totalQuantity = 0;

      // Process each card
      for (const cardInput of input.cards) {
        // Ensure the scryfall card exists in our database
        // If not, fetch it from Scryfall API
        const card = await ensureScryfallCard(cardInput.scryfallId);

        if (!card) {
          skippedCount++;
          console.warn(`Card not found in Scryfall: ${cardInput.scryfallId}`);
          continue;
        }

        try {
          // Create virtual_list_card entry
          await db.insert(virtualListCard).values({
            virtualListId: input.listId,
            scryfallCardId: card.id,
            quantity: cardInput.quantity,
          });

          // Touch the scryfall card's updated_at to trigger replication sync
          // This ensures the client pulls the scryfall card data even if it already existed in the DB
          await db
            .update(scryfallCard)
            .set({ updatedAt: new Date() })
            .where(eq(scryfallCard.id, card.id));

          addedCount++;
          totalQuantity += cardInput.quantity;
        } catch (error) {
          // Handle any insertion errors
          if (isForeignKeyError(error)) {
            skippedCount++;
            console.warn(`Skipping card with FK error: ${card.id}`);
          } else {
            throw error;
          }
        }
      }

      return {
        listId: input.listId,
        added: addedCount,
        totalQuantity,
        skipped: skippedCount,
        message:
          skippedCount > 0
            ? `Added ${totalQuantity} card${totalQuantity !== 1 ? "s" : ""}. ${skippedCount} card${skippedCount !== 1 ? "s" : ""} could not be found.`
            : `Added ${totalQuantity} card${totalQuantity !== 1 ? "s" : ""} to the list.`,
      };
    }),

  /**
   * Get a public list by userId and slug (unauthenticated endpoint)
   */
  getPublicList: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        slug: z.string(),
      }),
    )
    .handler(async ({ input }) => {
      const [list] = await db
        .select({
          id: virtualList.id,
          userId: virtualList.userId,
          name: virtualList.name,
          description: virtualList.description,
          listType: virtualList.listType,
          sourceType: virtualList.sourceType,
          sourceName: virtualList.sourceName,
          snapshotDate: virtualList.snapshotDate,
          isPublic: virtualList.isPublic,
          slug: virtualList.slug,
          createdAt: virtualList.createdAt,
          updatedAt: virtualList.updatedAt,
          cardCount: sql<number>`count(${virtualListCard.id})`.as("card_count"),
        })
        .from(virtualList)
        .leftJoin(virtualListCard, eq(virtualListCard.virtualListId, virtualList.id))
        .where(
          and(
            eq(virtualList.userId, input.userId),
            eq(virtualList.slug, input.slug),
            eq(virtualList.isPublic, true),
          ),
        )
        .groupBy(virtualList.id);

      if (!list) {
        throw new ORPCError("NOT_FOUND", { message: "List not found or not public" });
      }

      return list;
    }),

  /**
   * Get cards from a public list (unauthenticated endpoint)
   */
  getPublicListCards: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        slug: z.string(),
      }),
    )
    .handler(async ({ input }) => {
      // First verify the list exists and is public
      const [list] = await db
        .select({ id: virtualList.id })
        .from(virtualList)
        .where(
          and(
            eq(virtualList.userId, input.userId),
            eq(virtualList.slug, input.slug),
            eq(virtualList.isPublic, true),
          ),
        );

      if (!list) {
        throw new ORPCError("NOT_FOUND", { message: "List not found or not public" });
      }

      // Get all cards in the list with scryfall data
      const cards = await db
        .select({
          id: virtualListCard.id,
          notes: virtualListCard.notes,
          quantity: virtualListCard.quantity,
          condition: virtualListCard.condition,
          isFoil: virtualListCard.isFoil,
          language: virtualListCard.language,
          createdAt: virtualListCard.createdAt,
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
            priceUsd: scryfallCard.priceUsd,
            priceUsdFoil: scryfallCard.priceUsdFoil,
          },
        })
        .from(virtualListCard)
        .innerJoin(scryfallCard, eq(virtualListCard.scryfallCardId, scryfallCard.id))
        .where(eq(virtualListCard.virtualListId, list.id))
        .orderBy(
          desc(sql`CASE WHEN ${virtualListCard.isFoil} = 1 THEN ${scryfallCard.priceUsdFoil} ELSE ${scryfallCard.priceUsd} END`),
          asc(scryfallCard.name),
        );

      return cards.map((card) => ({
        id: card.id,
        notes: card.notes,
        quantity: card.quantity,
        condition: card.condition,
        isFoil: card.isFoil,
        language: card.language,
        createdAt: card.createdAt,
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
          priceUsd: card.scryfallCard.priceUsd,
          priceUsdFoil: card.scryfallCard.priceUsdFoil,
        },
      }));
    }),
};
