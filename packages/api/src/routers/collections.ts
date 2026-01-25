import { ORPCError } from "@orpc/server";
import { db } from "@mana-vault/db";
import { storageContainer, collectionCardLocation } from "@mana-vault/db/schema/app";
import { and, asc, eq, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";

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
};
