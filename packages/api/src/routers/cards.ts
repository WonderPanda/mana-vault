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
     *
     * Uses an "effective_updated_at" computed as the MAX of:
     * - The scryfall card's own updated_at
     * - The most recent collection_card, deck_card, or virtual_list_card referencing it
     *
     * This ensures newly-linked cards (e.g. from a deck import) are picked up by
     * incremental sync even though the scryfall card data itself hasn't changed.
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

        // Compute effective_updated_at: the most recent timestamp across the scryfall
        // card itself and all referencing rows for this user. This ensures that when a
        // user links an existing scryfall card to a deck/collection/list, the effective
        // timestamp advances past the checkpoint so incremental sync picks it up.
        // Uses raw integer milliseconds for D1 compatibility.
        // Use fully-qualified table.column names in raw SQL to avoid ambiguity
        // inside the subquery (Drizzle strips table prefixes from column refs)
        const effectiveUpdatedAt = sql<number>`MAX(
          "scryfall_card"."updated_at",
          COALESCE((
            SELECT MAX("collection_card"."updated_at")
            FROM "collection_card"
            WHERE "collection_card"."scryfall_card_id" = "scryfall_card"."id"
              AND "collection_card"."user_id" = ${userId}
          ), 0),
          COALESCE((
            SELECT MAX("deck_card"."updated_at")
            FROM "deck_card"
            INNER JOIN "deck" ON "deck_card"."deck_id" = "deck"."id"
            WHERE "deck_card"."preferred_scryfall_id" = "scryfall_card"."id"
              AND "deck"."user_id" = ${userId}
          ), 0),
          COALESCE((
            SELECT MAX("virtual_list_card"."created_at")
            FROM "virtual_list_card"
            INNER JOIN "virtual_list" ON "virtual_list_card"."virtual_list_id" = "virtual_list"."id"
            WHERE "virtual_list_card"."scryfall_card_id" = "scryfall_card"."id"
              AND "virtual_list"."user_id" = ${userId}
          ), 0)
        )`.as("effective_updated_at");

        const sq = db
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
            priceUsd: scryfallCard.priceUsd,
            priceUsdFoil: scryfallCard.priceUsdFoil,
            priceUsdEtched: scryfallCard.priceUsdEtched,
            dataJson: scryfallCard.dataJson,
            createdAt: scryfallCard.createdAt,
            updatedAt: scryfallCard.updatedAt,
            effectiveUpdatedAt,
          })
          .from(scryfallCard)
          .where(userReferencedCardCondition)
          .as("sq");

        let documents;
        if (checkpoint) {
          documents = await db
            .select()
            .from(sq)
            .where(
              or(
                gt(sq.effectiveUpdatedAt, checkpoint.updatedAt),
                and(eq(sq.effectiveUpdatedAt, checkpoint.updatedAt), gt(sq.id, checkpoint.id)),
              ),
            )
            .orderBy(asc(sq.effectiveUpdatedAt), asc(sq.id))
            .limit(batchSize);
        } else {
          documents = await db
            .select()
            .from(sq)
            .orderBy(asc(sq.effectiveUpdatedAt), asc(sq.id))
            .limit(batchSize);
        }

        // Transform documents for RxDB (ensure timestamps are ms integers, add _deleted flag)
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
          priceUsd: doc.priceUsd,
          priceUsdFoil: doc.priceUsdFoil,
          priceUsdEtched: doc.priceUsdEtched,
          dataJson: doc.dataJson,
          createdAt: toMs(doc.createdAt),
          updatedAt: toMs(doc.updatedAt),
          _deleted: false,
        }));

        // Checkpoint uses effectiveUpdatedAt so it advances monotonically
        // even when returning cards that were newly linked (not newly updated)
        const lastDoc = documents[documents.length - 1];
        const newCheckpoint: ReplicationCheckpoint = lastDoc
          ? { id: lastDoc.id, updatedAt: lastDoc.effectiveUpdatedAt }
          : checkpoint;

        return {
          documents: rxdbDocuments,
          checkpoint: newCheckpoint,
        };
      }),
  },
};

/** Safely convert a Date or raw integer (from D1 subquery) to milliseconds. */
function toMs(value: Date | number): number {
  return typeof value === "number" ? value : value.getTime();
}
