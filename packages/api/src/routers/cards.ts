import { db } from "@mana-vault/db";
import {
  scryfallCard,
  collectionCard,
  deck,
  deckCard,
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

type ReplicationCheckpoint = z.infer<typeof checkpointSchema>;

/**
 * Cards router for Scryfall card reference data.
 * Provides sync endpoints for replicating card data to clients.
 */
export const cardsRouter = {
  // =============================================================================
  // Sync Endpoints for RxDB Replication
  // =============================================================================

  sync: {
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
