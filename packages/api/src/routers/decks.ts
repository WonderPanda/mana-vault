import { ORPCError, eventIterator } from "@orpc/server";
import { db } from "@mana-vault/db";
import { deck, deckCard, scryfallCard } from "@mana-vault/db/schema/app";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { parseManaBoxCSV } from "../parsers/manabox";
import { parseMoxfieldText } from "../parsers/moxfield";
import { ensureScryfallCard } from "../utils/scryfall-fetch";
import { lookupScryfallCard } from "../utils/scryfall-lookup";
import {
  deckPublisher,
  deckCardPublisher,
  toDeckReplicationDoc,
  type DeckStreamEvent,
  type DeckCardStreamEvent,
} from "../publishers/deck-publisher";

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

      // Publish event to notify connected clients
      if (newDeck) {
        const replicationDoc = toDeckReplicationDoc(newDeck);
        deckPublisher.publish(userId, {
          documents: [replicationDoc],
          checkpoint: {
            id: replicationDoc.id,
            updatedAt: replicationDoc.updatedAt,
          },
        });
      }

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

      // Emit RESYNC to notify connected clients to re-sync deck cards
      // This is more efficient than publishing each card individually for bulk imports
      // Note: Scryfall card sync is triggered client-side when deck cards change
      if (importedCount > 0) {
        deckCardPublisher.publish(userId, "RESYNC");
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

      // Publish deletion event to notify connected clients
      // We create a minimal doc with _deleted: true for RxDB to handle the deletion
      const now = Date.now();
      deckPublisher.publish(userId, {
        documents: [
          {
            id: input.id,
            userId,
            name: existingDeck.name,
            format: "",
            status: "",
            archetype: null,
            colorIdentity: null,
            description: null,
            isPublic: false,
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

      return { success: true, deletedDeckName: existingDeck.name };
    }),

  /**
   * Add cards from Scryfall search to a deck.
   * This creates deck_card entries with oracle_id and preferred printing.
   *
   * Per SCHEMA.md: deck_card uses oracle_id for the card concept,
   * with optional preferred_scryfall_id for the selected printing.
   */
  addCardsFromSearch: protectedProcedure
    .input(
      z.object({
        /** The ID of the deck to add cards to */
        deckId: z.string(),
        /** Cards to add with their Scryfall IDs and quantities */
        cards: z
          .array(
            z.object({
              scryfallId: z.string(),
              quantity: z.number().int().positive().default(1),
            }),
          )
          .min(1, "At least one card is required"),
        /** Which board to add the cards to (default: mainboard) */
        board: z.enum(["main", "sideboard", "maybeboard"]).default("main"),
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
          // Create deck_card entry with oracle_id and preferred printing
          await db.insert(deckCard).values({
            deckId: input.deckId,
            oracleId: card.oracleId,
            preferredScryfallId: card.id,
            quantity: cardInput.quantity,
            board: input.board,
            isCommander: false,
            isCompanion: false,
            isProxy: false,
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

      // Emit RESYNC to notify connected clients to re-sync deck cards
      // Note: Scryfall card sync is triggered client-side when deck cards change
      if (addedCount > 0) {
        deckCardPublisher.publish(userId, "RESYNC");
      }

      return {
        deckId: input.deckId,
        added: addedCount,
        totalQuantity,
        skipped: skippedCount,
        message:
          skippedCount > 0
            ? `Added ${totalQuantity} card${totalQuantity !== 1 ? "s" : ""}. ${skippedCount} card${skippedCount !== 1 ? "s" : ""} could not be found.`
            : `Added ${totalQuantity} card${totalQuantity !== 1 ? "s" : ""} to the deck.`,
      };
    }),

  // =============================================================================
  // Sync Endpoints for RxDB Replication
  // =============================================================================

  sync: {
    /**
     * Pull endpoint for deck replication.
     * Returns documents modified after the given checkpoint.
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
        const userCondition = eq(deck.userId, userId);

        let documents;
        if (checkpoint) {
          // Get documents after the checkpoint
          // We compare updatedAt first, then id for stable ordering when timestamps match
          documents = await db
            .select({
              id: deck.id,
              userId: deck.userId,
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
            })
            .from(deck)
            .where(
              and(
                userCondition,
                or(
                  gt(deck.updatedAt, new Date(checkpoint.updatedAt)),
                  and(
                    eq(deck.updatedAt, new Date(checkpoint.updatedAt)),
                    gt(deck.id, checkpoint.id),
                  ),
                ),
              ),
            )
            .orderBy(asc(deck.updatedAt), asc(deck.id))
            .limit(batchSize);
        } else {
          // Initial sync - get all documents
          documents = await db
            .select({
              id: deck.id,
              userId: deck.userId,
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
            })
            .from(deck)
            .where(userCondition)
            .orderBy(asc(deck.updatedAt), asc(deck.id))
            .limit(batchSize);
        }

        // Transform documents for RxDB (convert dates to timestamps, add _deleted flag)
        const rxdbDocuments = documents.map((doc) => ({
          id: doc.id,
          userId: doc.userId,
          name: doc.name,
          format: doc.format,
          status: doc.status,
          archetype: doc.archetype,
          colorIdentity: doc.colorIdentity,
          description: doc.description,
          isPublic: doc.isPublic,
          sortOrder: doc.sortOrder,
          createdAt: doc.createdAt.getTime(),
          updatedAt: doc.updatedAt.getTime(),
          _deleted: false, // TODO: implement soft deletes on server to sync deletions
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
     * Stream endpoint for live deck replication.
     * Uses Server-Sent Events (SSE) to push real-time updates to clients.
     *
     * The stream emits events when decks are created, updated, or deleted.
     * Clients should use this with RxDB's pull.stream$ for live replication.
     *
     * @see https://rxdb.info/replication-http.html#pullstream-for-ongoing-changes
     */
    stream: protectedProcedure
      .output(eventIterator(z.custom<DeckStreamEvent>()))
      .handler(async function* ({ context, signal }) {
        const userId = context.session.user.id;

        // Subscribe to deck events for this user
        for await (const event of deckPublisher.subscribe(userId, { signal })) {
          yield event;
        }
      }),
  },

  cardSync: {
    /**
     * Pull endpoint for deck card replication.
     * Returns deck cards for all decks owned by the user.
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

        // Base select fields for deck cards
        const selectFields = {
          id: deckCard.id,
          deckId: deckCard.deckId,
          oracleId: deckCard.oracleId,
          preferredScryfallId: deckCard.preferredScryfallId,
          quantity: deckCard.quantity,
          board: deckCard.board,
          isCommander: deckCard.isCommander,
          isCompanion: deckCard.isCompanion,
          collectionCardId: deckCard.collectionCardId,
          isProxy: deckCard.isProxy,
          sortOrder: deckCard.sortOrder,
          createdAt: deckCard.createdAt,
          updatedAt: deckCard.updatedAt,
        };

        let documents;
        if (checkpoint) {
          // Get documents after the checkpoint
          // Use inner join to filter by user's decks
          documents = await db
            .select(selectFields)
            .from(deckCard)
            .innerJoin(deck, eq(deckCard.deckId, deck.id))
            .where(
              and(
                eq(deck.userId, userId),
                or(
                  gt(deckCard.updatedAt, new Date(checkpoint.updatedAt)),
                  and(
                    eq(deckCard.updatedAt, new Date(checkpoint.updatedAt)),
                    gt(deckCard.id, checkpoint.id),
                  ),
                ),
              ),
            )
            .orderBy(asc(deckCard.updatedAt), asc(deckCard.id))
            .limit(batchSize);
        } else {
          // Initial sync - get all deck cards for user's decks
          // Use inner join to filter by user's decks
          documents = await db
            .select(selectFields)
            .from(deckCard)
            .innerJoin(deck, eq(deckCard.deckId, deck.id))
            .where(eq(deck.userId, userId))
            .orderBy(asc(deckCard.updatedAt), asc(deckCard.id))
            .limit(batchSize);
        }

        // Transform documents for RxDB (convert dates to timestamps, add _deleted flag)
        const rxdbDocuments = documents.map((doc) => ({
          id: doc.id,
          deckId: doc.deckId,
          oracleId: doc.oracleId,
          preferredScryfallId: doc.preferredScryfallId,
          quantity: doc.quantity,
          board: doc.board,
          isCommander: doc.isCommander,
          isCompanion: doc.isCompanion,
          collectionCardId: doc.collectionCardId,
          isProxy: doc.isProxy,
          sortOrder: doc.sortOrder,
          createdAt: doc.createdAt.getTime(),
          updatedAt: doc.updatedAt.getTime(),
          _deleted: false, // TODO: implement soft deletes on server to sync deletions
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
     * Stream endpoint for live deck card replication.
     * Uses Server-Sent Events (SSE) to push real-time updates to clients.
     *
     * The stream can emit:
     * - Document updates with checkpoint (for individual card changes)
     * - 'RESYNC' signal (after bulk imports to trigger full re-sync)
     *
     * @see https://rxdb.info/replication-http.html#pullstream-for-ongoing-changes
     */
    stream: protectedProcedure
      .output(eventIterator(z.custom<DeckCardStreamEvent>()))
      .handler(async function* ({ context, signal }) {
        const userId = context.session.user.id;

        // Subscribe to deck card events for this user
        for await (const event of deckCardPublisher.subscribe(userId, { signal })) {
          yield event;
        }
      }),
  },
};
