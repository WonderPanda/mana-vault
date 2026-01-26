import { db } from "@mana-vault/db";
import {
  deck,
  deckCard,
  scryfallCard,
  collectionCard,
  virtualList,
  virtualListCard,
} from "@mana-vault/db/schema/app";
import { and, eq, gt, or, asc, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";

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

export type ReplicationCheckpoint = z.infer<typeof checkpointSchema>;

/**
 * Sync router for RxDB replication.
 * Implements pull-only replication following the RxDB HTTP replication protocol.
 * @see https://rxdb.info/replication-http.html
 */
export const syncRouter = {
  decks: {
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
  },

  deckCards: {
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
  },

  scryfallCards: {
    /**
     * Pull endpoint for scryfall card replication.
     * Only returns cards that are referenced by the user's collection, decks, or lists.
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

        // Build a condition to check if scryfall card ID is referenced by this user
        // from collection_card, deck_card (via deck), and virtual_list_card (via virtual_list)
        const userReferencedCardCondition = sql`${scryfallCard.id} IN (
          SELECT DISTINCT scryfall_card_id FROM (
            SELECT ${collectionCard.scryfallCardId} as scryfall_card_id
            FROM ${collectionCard}
            WHERE ${collectionCard.userId} = ${userId}
              AND ${collectionCard.scryfallCardId} IS NOT NULL

            UNION

            SELECT ${deckCard.preferredScryfallId} as scryfall_card_id
            FROM ${deckCard}
            INNER JOIN ${deck} ON ${deckCard.deckId} = ${deck.id}
            WHERE ${deck.userId} = ${userId}
              AND ${deckCard.preferredScryfallId} IS NOT NULL

            UNION

            SELECT ${virtualListCard.scryfallCardId} as scryfall_card_id
            FROM ${virtualListCard}
            INNER JOIN ${virtualList} ON ${virtualListCard.virtualListId} = ${virtualList.id}
            WHERE ${virtualList.userId} = ${userId}
              AND ${virtualListCard.scryfallCardId} IS NOT NULL
          )
        )`;

        let documents;
        if (checkpoint) {
          // Get documents after the checkpoint
          documents = await db
            .select({
              id: scryfallCard.id,
              oracleId: scryfallCard.oracleId,
              name: scryfallCard.name,
              setCode: scryfallCard.setCode,
              setName: scryfallCard.setName,
              collectorNumber: scryfallCard.collectorNumber,
              rarity: scryfallCard.rarity,
              manaCost: scryfallCard.manaCost,
              cmc: scryfallCard.cmc,
              typeLine: scryfallCard.typeLine,
              oracleText: scryfallCard.oracleText,
              colors: scryfallCard.colors,
              colorIdentity: scryfallCard.colorIdentity,
              imageUri: scryfallCard.imageUri,
              scryfallUri: scryfallCard.scryfallUri,
              dataJson: scryfallCard.dataJson,
              createdAt: scryfallCard.createdAt,
              updatedAt: scryfallCard.updatedAt,
            })
            .from(scryfallCard)
            .where(
              and(
                userReferencedCardCondition,
                or(
                  gt(scryfallCard.updatedAt, new Date(checkpoint.updatedAt)),
                  and(
                    eq(scryfallCard.updatedAt, new Date(checkpoint.updatedAt)),
                    gt(scryfallCard.id, checkpoint.id),
                  ),
                ),
              ),
            )
            .orderBy(asc(scryfallCard.updatedAt), asc(scryfallCard.id))
            .limit(batchSize);
        } else {
          // Initial sync - get all user's referenced cards
          documents = await db
            .select({
              id: scryfallCard.id,
              oracleId: scryfallCard.oracleId,
              name: scryfallCard.name,
              setCode: scryfallCard.setCode,
              setName: scryfallCard.setName,
              collectorNumber: scryfallCard.collectorNumber,
              rarity: scryfallCard.rarity,
              manaCost: scryfallCard.manaCost,
              cmc: scryfallCard.cmc,
              typeLine: scryfallCard.typeLine,
              oracleText: scryfallCard.oracleText,
              colors: scryfallCard.colors,
              colorIdentity: scryfallCard.colorIdentity,
              imageUri: scryfallCard.imageUri,
              scryfallUri: scryfallCard.scryfallUri,
              dataJson: scryfallCard.dataJson,
              createdAt: scryfallCard.createdAt,
              updatedAt: scryfallCard.updatedAt,
            })
            .from(scryfallCard)
            .where(userReferencedCardCondition)
            .orderBy(asc(scryfallCard.updatedAt), asc(scryfallCard.id))
            .limit(batchSize);
        }

        // Transform documents for RxDB (convert dates to timestamps, add _deleted flag)
        const rxdbDocuments = documents.map((doc) => ({
          id: doc.id,
          oracleId: doc.oracleId,
          name: doc.name,
          setCode: doc.setCode,
          setName: doc.setName,
          collectorNumber: doc.collectorNumber,
          rarity: doc.rarity,
          manaCost: doc.manaCost,
          cmc: doc.cmc,
          typeLine: doc.typeLine,
          oracleText: doc.oracleText,
          colors: doc.colors,
          colorIdentity: doc.colorIdentity,
          imageUri: doc.imageUri,
          scryfallUri: doc.scryfallUri,
          dataJson: doc.dataJson,
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
  },
};
